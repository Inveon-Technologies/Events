import { sequelize } from '../db/connection';
import { Organizer, Booking, Payment, Ticket } from '../models';
import { cashfreeCreateOrder } from './cashfreeClient';
import { buildBookingEmailPayload, sendBookingConfirmationEmail } from './bookingEmails';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 5;

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
  });

  await Payment.update({ gatewayReference: orderResponse.order_id }, { where: { bookingId: params.bookingId } });

  return { paymentSessionId: orderResponse.payment_session_id };
}

export type CashfreeWebhookType = 'PAYMENT_SUCCESS_WEBHOOK' | 'PAYMENT_FAILED_WEBHOOK' | 'PAYMENT_USER_DROPPED_WEBHOOK';

export interface CashfreeWebhookPayload {
  type: string;
  data: {
    order: { order_id: string };
  };
}

// Idempotent by design: a webhook can be retried or duplicated by
// Cashfree, and this only ever acts when the booking is still 'pending'
// — a second delivery of the same event finds the booking already
// confirmed/cancelled and does nothing further, rather than double-
// processing (e.g. releasing quota twice).
export async function processCashfreeWebhook(payload: CashfreeWebhookPayload): Promise<void> {
  const orderId = payload.data?.order?.order_id;
  if (!orderId) return;

  const payment = await Payment.findOne({ where: { gatewayReference: orderId } });
  if (!payment) return; // Not one of our orders (or one we haven't recorded yet) — nothing to do.

  const booking = await Booking.findByPk(payment.bookingId);
  if (!booking || booking.status !== 'pending') return;

  if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    await sequelize.transaction(async (t) => {
      await payment.update({ status: 'paid' }, { transaction: t });
      await booking.update({ status: 'confirmed' }, { transaction: t });
    });

    // Only now — a "confirmation" email for a booking that was still
    // pending payment would tell the customer they're booked before
    // they've actually paid. Fire-and-forget like the cash/free path in
    // publicBookings.ts: the payment is already confirmed and committed
    // at this point, so a failed or slow email must never be treated as
    // this webhook having failed (Cashfree would just retry it).
    const emailPayload = await buildBookingEmailPayload(booking.id);
    if (emailPayload) {
      void sendBookingConfirmationEmail(emailPayload);
    }
    return;
  }

  if (payload.type === 'PAYMENT_FAILED_WEBHOOK' || payload.type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    await sequelize.transaction(async (t) => {
      await payment.update({ status: 'failed' }, { transaction: t });
      await booking.update({ status: 'cancelled' }, { transaction: t });

      const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, transaction: t });
      for (const ticket of tickets) {
        // eslint-disable-next-line no-await-in-loop
        await ticket.update({ status: 'cancelled' }, { transaction: t });
      }
      // Release the reservation this booking took at creation time — an
      // abandoned or failed online payment must not leave real stock
      // permanently locked up for tickets nobody actually bought.
      if (tickets.length > 0) {
        await sequelize.query(
          `UPDATE ticket_categories SET quota_remaining = quota_remaining + :qty, updated_at = NOW() WHERE id = :id`,
          { replacements: { qty: tickets.length, id: tickets[0].ticketCategoryId }, transaction: t },
        );
      }
    });
  }
}
