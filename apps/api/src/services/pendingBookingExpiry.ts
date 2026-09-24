import { Op } from 'sequelize';
import { Booking, Payment } from '../models';
import { cashfreeGetOrder, CashfreeApiError, CashfreeNotConfiguredError } from './cashfreeClient';
import { cancelPendingOnlineBooking, confirmPendingOnlineBooking, ONLINE_PAYMENT_WINDOW_MS } from './cashfreeOrders';

// A little past the Cashfree session's own expiry, so a payment made in
// its final seconds has time for its webhook to land first.
export const PENDING_ONLINE_BOOKING_TTL_MS = ONLINE_PAYMENT_WINDOW_MS + 10 * 60 * 1000;

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
      createdAt: { [Op.lt]: new Date(now.getTime() - PENDING_ONLINE_BOOKING_TTL_MS) },
    },
    limit: 200,
    order: [['createdAt', 'ASC']],
  });

  for (const booking of stale) {
    // eslint-disable-next-line no-await-in-loop
    const payment = await Payment.findOne({ where: { bookingId: booking.id } });
    if (!payment) {
      result.skipped += 1;
      continue;
    }

    // Before releasing anything, ask Cashfree directly — the webhook
    // may have been delayed or lost, and a paid booking must be
    // confirmed, not cancelled.
    if (payment.gatewayReference) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const order = await cashfreeGetOrder(payment.gatewayReference);
        if (order.order_status === 'PAID') {
          // eslint-disable-next-line no-await-in-loop
          if (await confirmPendingOnlineBooking(payment)) result.confirmed += 1;
          continue;
        }
      } catch (err) {
        const orderDoesNotExist = err instanceof CashfreeApiError && err.status === 404;
        // No credentials means no payment could have been taken (or
        // verified) at all, so there's nothing to wait for.
        if (!orderDoesNotExist && !(err instanceof CashfreeNotConfiguredError)) {
          // Cashfree unreachable — don't guess; try again next run.
          result.skipped += 1;
          continue;
        }
      }
    }

    // eslint-disable-next-line no-await-in-loop
    if (await cancelPendingOnlineBooking(payment, 'Payment was not completed in time — booking expired')) {
      result.expired += 1;
    }
  }

  return result;
}
