import { Op, fn, col, where as sqlWhere } from 'sequelize';
import { Booking, Payment } from '../models';
import { cashfreeGetOrder, cashfreeGetOrderPayments, CashfreeApiError, CashfreeNotConfiguredError } from './cashfreeClient';
import { cancelPendingOnlineBooking, confirmPendingOnlineBooking, ONLINE_PAYMENT_WINDOW_MS } from './cashfreeOrders';
import { logger } from '../logger';

// How long an unpaid online booking holds its seats (like a cinema
// seat hold). After that they go back on sale — the customer can still
// finish paying in the open Cashfree window, and a late payment is
// reinstated if seats are left or refunded automatically if not (see
// handleLateOnlinePayment). SEAT_HOLD_MINUTES overrides the default.
export const SEAT_HOLD_MS = Math.max(1, Number(process.env.SEAT_HOLD_MINUTES) || 2) * 60 * 1000;
// Kept for callers/tests that referred to the old name.
export const PENDING_ONLINE_BOOKING_TTL_MS = SEAT_HOLD_MS;

export interface ExpirySweepResult {
  expired: number;
  confirmed: number;
  skipped: number;
}

// Online bookings reserve their tickets at creation and only release
// them on a failed/dropped payment webhook — which never arrives if the
// customer closes the tab before Cashfree's checkout even loads, or if
// order creation itself failed after the booking was committed. Without
// this sweep those tickets would stay reserved forever.
//
// Cash bookings are deliberately left alone: they stay pending until
// the organizer records the cash, however long that takes.
export async function expireStalePendingOnlineBookings(now: Date = new Date()): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { expired: 0, confirmed: 0, skipped: 0 };

  const stale = await Booking.findAll({
    where: {
      status: 'pending',
      paymentMethod: 'online',
      createdAt: { [Op.lt]: new Date(now.getTime() - SEAT_HOLD_MS) },
    },
    limit: 200,
    order: [['createdAt', 'ASC']],
  });

  for (const booking of stale) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await releaseHold(booking, now, 'Payment was not completed in time — seats released');
    result[outcome] += 1;
  }

  return result;
}

// Releases one unpaid online booking's seats — unless Cashfree says it
// was paid (then it's confirmed) or a payment is going through right now
// (then it's left alone until the Cashfree window closes).
async function releaseHold(booking: Booking, now: Date, reason: string): Promise<'expired' | 'confirmed' | 'skipped'> {
  const payment = await Payment.findOne({ where: { bookingId: booking.id } });
  if (!payment) return 'skipped';

  if (payment.gatewayReference) {
    try {
      const order = await cashfreeGetOrder(payment.gatewayReference);
      if (order.order_status === 'PAID') {
        return (await confirmPendingOnlineBooking(payment)) ? 'confirmed' : 'skipped';
      }
      const withinWindow = now.getTime() - booking.createdAt.getTime() < ONLINE_PAYMENT_WINDOW_MS;
      if (withinWindow && order.order_status === 'ACTIVE') {
        const attempts = await cashfreeGetOrderPayments(payment.gatewayReference).catch(() => []);
        if (attempts.some((a) => a.payment_status === 'PENDING')) return 'skipped';
      }
    } catch (err) {
      const orderDoesNotExist = err instanceof CashfreeApiError && err.status === 404;
      // No credentials means no payment could have been taken (or
      // verified) at all, so there's nothing to wait for.
      if (!orderDoesNotExist && !(err instanceof CashfreeNotConfiguredError)) {
        // Cashfree unreachable — don't guess; try again next run.
        logger.warn({ err, bookingId: booking.id }, 'Could not check Cashfree before releasing a seat hold');
        return 'skipped';
      }
    }
  }

  return (await cancelPendingOnlineBooking(payment, reason)) ? 'expired' : 'skipped';
}

// A customer who abandons checkout and tries again shouldn't be blocked
// by their own earlier hold ("0 left"): release this customer's unpaid
// online bookings for the event before the new one is made.
export async function releaseCustomersOwnHolds(eventId: string, email: string, now: Date = new Date()): Promise<number> {
  const mine = await Booking.findAll({
    where: {
      eventId,
      status: 'pending',
      paymentMethod: 'online',
      [Op.and]: [sqlWhere(fn('lower', col('primary_contact_email')), email.trim().toLowerCase())],
    },
    limit: 10,
  });
  let released = 0;
  for (const booking of mine) {
    // eslint-disable-next-line no-await-in-loop
    if ((await releaseHold(booking, now, 'Replaced by a new booking attempt from the same customer')) === 'expired') released += 1;
  }
  return released;
}
