import { sequelize } from '../db/connection';
import { Organizer, Booking, Payment, Event } from '../models';
import { cashfreeCreateOrder, cashfreeCreateRefund } from './cashfreeClient';
import { releaseBookingTickets, reserveBookingTickets } from './bookingTickets';
import { enqueueNotification } from '../queue';
import { logger } from '../logger';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 5;

// How long a customer has to finish paying once checkout starts. The
// Cashfree session is set to expire at this point, and the pending-
// booking sweep (pendingBookingExpiry.ts) releases unpaid tickets a
// little after it. Cashfree's minimum is 15 minutes.
export const ONLINE_PAYMENT_WINDOW_MS = 20 * 60 * 1000;

export class NotFoundError extends Error {}

export interface CreateOrderForBookingParams {
  bookingId: string;
  bookingReference: string;
  totalAmountPaise: number;
  organizerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}

export interface CreateOrderForBookingResult {
  paymentSessionId: string;
}

// createBooking() (bookingCreation.ts) already refuses an online booking
// for a paid tier unless the organizer's Cashfree vendor is active —
// this function trusts that gate rather than re-checking it, since
// re-deriving "is this organizer verified" here would just be a second
// copy of the same rule to keep in sync.
export async function createCashfreeOrderForBooking(params: CreateOrderForBookingParams): Promise<CreateOrderForBookingResult> {
  const organizer = await Organizer.findByPk(params.organizerId);
  if (!organizer || !organizer.cashfreeVendorId) {
    throw new NotFoundError('Organizer has no registered payment vendor');
  }

  const totalRupees = params.totalAmountPaise / 100;
  // Rounded to paise precision (2 decimals) before sending to Cashfree —
  // order_splits amounts must add up sanely against the whole order
  // amount, and floating-point rupee math left unrounded here could
  // produce a split that's a fraction of a paisa off.
  const vendorShareRupees = Math.round(totalRupees * (1 - PLATFORM_FEE_PERCENT / 100) * 100) / 100;

  const apiPublicUrl = process.env.API_PUBLIC_URL;
  if (!apiPublicUrl) {
    throw new Error('API_PUBLIC_URL is not set (see .env.example) — required to build the Cashfree webhook URL');
  }

  const orderResponse = await cashfreeCreateOrder({
    orderId: params.bookingReference,
    orderAmountRupees: totalRupees,
    customerId: params.bookingId,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
    vendorSplit: { vendorId: organizer.cashfreeVendorId, amountRupees: vendorShareRupees },
    returnUrl: params.returnUrl,
    notifyUrl: `${apiPublicUrl}/api/webhooks/cashfree`,
    expiresAt: new Date(Date.now() + ONLINE_PAYMENT_WINDOW_MS),
  });

  await Payment.update({ gatewayReference: orderResponse.order_id }, { where: { bookingId: params.bookingId } });

  return { paymentSessionId: orderResponse.payment_session_id };
}

export type CashfreeWebhookType = 'PAYMENT_SUCCESS_WEBHOOK' | 'PAYMENT_FAILED_WEBHOOK' | 'PAYMENT_USER_DROPPED_WEBHOOK';

export interface CashfreeWebhookPayload {
  type: string;
  data: {
    order: { order_id: string; order_amount?: number };
    payment?: { payment_amount?: number; cf_payment_id?: string | number };
  };
}

// The amount Cashfree says was actually paid, in paise — null when the
// payload doesn't carry one (older webhook versions), in which case
// there's nothing to compare against.
function paidAmountPaise(payload: CashfreeWebhookPayload): number | null {
  const amount = payload.data?.payment?.payment_amount ?? payload.data?.order?.order_amount;
  return typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

// Marks a booking paid and confirmed. Idempotent and race-safe: the
// status change is a single conditional UPDATE (pending -> confirmed),
// so of any number of concurrent or repeated deliveries exactly one
// wins; the rest change nothing. Returns whether this call won.
export async function confirmPendingOnlineBooking(payment: Payment): Promise<boolean> {
  const confirmed = await sequelize.transaction(async (t) => {
    const [count] = await Booking.update(
      { status: 'confirmed' },
      { where: { id: payment.bookingId, status: 'pending' }, transaction: t },
    );
    if (count === 0) return false;
    await Payment.update({ status: 'paid' }, { where: { id: payment.id }, transaction: t });
    return true;
  });

  if (confirmed) {
    // Only now — a "confirmation" email for a booking that was still
    // pending payment would tell the customer they're booked before
    // they've actually paid. Fire-and-forget: the payment is already
    // committed, so a failed or slow email must never be treated as
    // this webhook having failed (Cashfree would just retry it).
    void enqueueNotification(
      'booking-confirmation',
      { bookingId: payment.bookingId },
      { jobId: `booking-confirmation-${payment.bookingId}` },
    );
  }
  return confirmed;
}

// Cancels a still-pending online booking whose payment failed, was
// abandoned, or expired, and returns its tickets to sale. Same
// conditional-UPDATE guarantee as above: tickets are released at most
// once no matter how many deliveries (or the expiry sweep) race here.
export async function cancelPendingOnlineBooking(payment: Payment, reason: string): Promise<boolean> {
  return sequelize.transaction(async (t) => {
    const [count] = await Booking.update(
      { status: 'cancelled', cancellationReason: reason },
      { where: { id: payment.bookingId, status: 'pending' }, transaction: t },
    );
    if (count === 0) return false;
    await Payment.update({ status: 'failed' }, { where: { id: payment.id }, transaction: t });
    await releaseBookingTickets(payment.bookingId, t);
    return true;
  });
}

class NoStockToReinstateError extends Error {}

export type LatePaymentOutcome = 'reinstated' | 'refunded' | 'refund_failed' | 'not_applicable';

// A success webhook for a booking that's no longer pending. The only
// case that needs action is money arriving for a booking this system
// already gave up on — a payment that failed/was dropped and was then
// retried and completed in the same Cashfree session, or one that
// landed after the expiry sweep released the tickets. Silently ignoring
// it (the old behavior) left a customer charged with a cancelled
// booking and nobody told.
//
// Recognized by the payment row: still 'pending' or 'failed' means this
// system never recorded receiving this money. Anything else ('paid',
// 'refunded') means it was already handled — duplicate delivery, no-op.
export async function handleLateOnlinePayment(paymentId: string): Promise<LatePaymentOutcome> {
  let decision: 'reinstated' | 'refund' | 'not_applicable';
  try {
    decision = await sequelize.transaction(async (t) => {
      const payment = await Payment.findByPk(paymentId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!payment || (payment.status !== 'pending' && payment.status !== 'failed')) return 'not_applicable';
      const booking = await Booking.findByPk(payment.bookingId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!booking || booking.status !== 'cancelled') return 'not_applicable';
      const event = await Event.findByPk(booking.eventId, { transaction: t });

      const eventStillOn = !!event && event.status === 'published' && event.eventDate.getTime() > Date.now();
      if (!eventStillOn) return 'refund';
      if (!(await reserveBookingTickets(booking.id, t))) {
        // reserveBookingTickets may have decremented part of the stock
        // before finding a category short — roll all of it back.
        throw new NoStockToReinstateError();
      }
      await booking.update(
        { status: 'confirmed', cancellationReason: null, cancelledBy: null, refundAmountPaise: null, refundStatus: null },
        { transaction: t },
      );
      await payment.update({ status: 'paid' }, { transaction: t });
      return 'reinstated';
    });
  } catch (err) {
    if (!(err instanceof NoStockToReinstateError)) throw err;
    decision = 'refund';
  }

  if (decision === 'not_applicable') return 'not_applicable';

  if (decision === 'reinstated') {
    const payment = await Payment.findByPk(paymentId);
    if (payment) {
      void enqueueNotification(
        'booking-confirmation',
        { bookingId: payment.bookingId },
        { jobId: `booking-confirmation-${payment.bookingId}-reinstated` },
      );
    }
    return 'reinstated';
  }

  // Can't honor it (sold out meanwhile, or the event is cancelled/over):
  // record the money as received, keep the booking cancelled, and give
  // it all back.
  const toRefund = await sequelize.transaction(async (t) => {
    const payment = await Payment.findByPk(paymentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment || (payment.status !== 'pending' && payment.status !== 'failed')) return null;
    const booking = await Booking.findByPk(payment.bookingId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!booking) return null;
    await payment.update({ status: 'paid' }, { transaction: t });
    await booking.update(
      {
        cancellationReason:
          booking.cancellationReason ?? 'Payment was received after this booking had expired — refunded in full',
        refundAmountPaise: booking.totalAmountPaise,
        refundStatus: 'pending',
      },
      { transaction: t },
    );
    return { payment, booking };
  });
  if (!toRefund) return 'not_applicable';

  const { payment, booking } = toRefund;
  try {
    const refund = await cashfreeCreateRefund({
      orderId: payment.gatewayReference ?? booking.bookingReference,
      refundId: `${booking.bookingReference}-late-refund`,
      refundAmountRupees: booking.totalAmountPaise / 100,
      refundNote: 'Booking expired or was cancelled before payment completed',
    });
    await booking.update({ refundStatus: refund.refund_status });
    if (refund.refund_status === 'SUCCESS') await payment.update({ status: 'refunded' });
    return 'refunded';
  } catch (err) {
    logger.error({ err, bookingReference: booking.bookingReference }, 'Late payment could not be refunded automatically — needs manual follow-up');
    await booking.update({ refundStatus: 'failed' });
    return 'refund_failed';
  }
}

export async function processCashfreeWebhook(payload: CashfreeWebhookPayload): Promise<void> {
  const orderId = payload.data?.order?.order_id;
  if (!orderId) return;

  const payment = await Payment.findOne({ where: { gatewayReference: orderId } });
  if (!payment) return; // Not one of our orders (or one we haven't recorded yet) — nothing to do.

  if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    // The order amount is fixed by us at creation and the payload is
    // signature-verified, so a mismatch shouldn't be possible — but if
    // it ever happens, confirming the booking would hand out tickets
    // for money that wasn't paid. Leave it for a human instead.
    const paid = paidAmountPaise(payload);
    if (paid !== null && paid !== payment.amountPaise) {
      logger.error({ orderId, expectedPaise: payment.amountPaise, paidPaise: paid }, 'Cashfree payment amount mismatch — booking not confirmed');
      return;
    }

    const confirmed = await confirmPendingOnlineBooking(payment);
    if (!confirmed) await handleLateOnlinePayment(payment.id);
    return;
  }

  if (payload.type === 'PAYMENT_FAILED_WEBHOOK' || payload.type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    await cancelPendingOnlineBooking(payment, 'Online payment failed or was abandoned');
  }
}
