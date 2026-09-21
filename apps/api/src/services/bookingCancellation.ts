import { sequelize } from '../db/connection';
import { Event, Booking, Payment, Ticket } from '../models';
import { cashfreeCreateRefund } from './cashfreeClient';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

export interface CancellationResult {
  bookingId: string;
  refundAmountPaise: number;
  refundStatus: string | null;
}

// The DB side of a cancellation (mark cancelled, release quota) commits
// as one atomic unit; the Cashfree refund call happens afterward, never
// inside that transaction — holding a DB transaction open across a slow
// external network call is exactly the kind of thing that causes lock
// contention under load. This does mean the two can diverge (the ticket
// is freed even if the refund itself later fails or comes back PENDING)
// — that split is intentional: the customer's seat should never stay
// artificially held hostage to a refund's outcome, and a failed refund
// is tracked on the booking for the organizer to follow up on, not
// silently lost.
async function performCancellation(params: {
  booking: Booking;
  reason: string;
  cancelledBy: 'customer' | 'organizer';
  refundPercentage: number;
}): Promise<CancellationResult> {
  const { booking } = params;
  const refundAmountPaise = Math.round(booking.totalAmountPaise * (params.refundPercentage / 100));

  await sequelize.transaction(async (t) => {
    await booking.update(
      {
        status: 'cancelled',
        cancellationReason: params.reason,
        cancelledBy: params.cancelledBy,
        refundAmountPaise,
        refundStatus: refundAmountPaise > 0 ? 'pending' : null,
      },
      { transaction: t },
    );

    const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, transaction: t });
    for (const ticket of tickets) {
      // eslint-disable-next-line no-await-in-loop
      await ticket.update({ status: 'cancelled' }, { transaction: t });
    }
    if (tickets.length > 0) {
      await sequelize.query(
        `UPDATE ticket_categories SET quota_remaining = quota_remaining + :qty, updated_at = NOW() WHERE id = :id`,
        { replacements: { qty: tickets.length, id: tickets[0].ticketCategoryId }, transaction: t },
      );
    }
  });

  if (refundAmountPaise === 0) {
    return { bookingId: booking.id, refundAmountPaise: 0, refundStatus: null };
  }

  const payment = await Payment.findOne({ where: { bookingId: booking.id } });
  // A cash booking, or an online booking with no recorded gateway
  // order (shouldn't happen for a real confirmed online booking, but
  // defends against it anyway) — nothing to call Cashfree about; the
  // organizer handles that refund manually outside this system.
  if (!payment || payment.method !== 'online' || !payment.gatewayReference) {
    return { bookingId: booking.id, refundAmountPaise, refundStatus: null };
  }

  let refundStatus: string;
  try {
    const refund = await cashfreeCreateRefund({
      orderId: payment.gatewayReference,
      refundId: `${booking.bookingReference}-refund`,
      refundAmountRupees: refundAmountPaise / 100,
      refundNote: params.reason,
    });
    refundStatus = refund.refund_status;
  } catch {
    // The booking stays cancelled regardless — only the refund's own
    // tracked status reflects that it needs manual follow-up, whether
    // the failure was Cashfree rejecting the request or the server
    // having no working credentials at all.
    refundStatus = 'failed';
  }

  await booking.update({ refundStatus });
  if (refundStatus === 'SUCCESS' || refundStatus === 'success') {
    await payment.update({ status: 'refunded' });
  }

  return { bookingId: booking.id, refundAmountPaise, refundStatus };
}

export async function customerCancelBooking(bookingReference: string, email: string, reason: string): Promise<CancellationResult> {
  const booking = await Booking.findOne({ where: { bookingReference: bookingReference.trim() } });
  if (!booking || booking.primaryContactEmail.toLowerCase() !== email.trim().toLowerCase()) {
    // Same "not found" for a wrong email as for a nonexistent booking —
    // matches the same enumeration-safety reasoning as the feedback
    // endpoint (eventReviews.ts): a distinguishable error here would
    // let someone confirm a real booking reference exists by guessing.
    throw new NotFoundError('Booking not found');
  }
  if (booking.status !== 'confirmed') {
    throw new ValidationError('This booking cannot be cancelled');
  }
  if (!reason.trim()) {
    throw new ValidationError('A cancellation reason is required');
  }

  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('Booking not found');

  if (!event.allowSelfServiceCancellation) {
    throw new ValidationError('Self-service cancellation is not available for this event — please contact the organizer');
  }
  if (event.refundCutoffDays === null) {
    throw new ValidationError('Self-service cancellation is not available for this event — please contact the organizer');
  }

  const cutoffTime = event.eventDate.getTime() - event.refundCutoffDays * 24 * 60 * 60 * 1000;
  if (Date.now() > cutoffTime) {
    throw new ValidationError(`The cancellation window for this event has closed (cutoff: ${event.refundCutoffDays} day(s) before the event)`);
  }

  return performCancellation({
    booking,
    reason: reason.trim(),
    cancelledBy: 'customer',
    refundPercentage: event.refundPercentage ?? 0,
  });
}

export async function organizerCancelBooking(bookingId: string, organizerId: string, reason: string): Promise<CancellationResult> {
  if (!reason.trim()) throw new ValidationError('A cancellation reason is required');

  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');

  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('Booking not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('You do not have access to this booking');

  if (booking.status !== 'confirmed') {
    throw new ValidationError('This booking cannot be cancelled');
  }

  // An organizer-initiated cancellation always refunds in full,
  // regardless of the event's self-service refund_percentage policy —
  // that policy governs what a customer gets by cancelling themselves,
  // not what an organizer chooses to do when they cancel a booking on
  // someone's behalf.
  return performCancellation({ booking, reason: reason.trim(), cancelledBy: 'organizer', refundPercentage: 100 });
}

export interface EventCancellationResult {
  cancelledBookings: CancellationResult[];
}

export async function organizerCancelEvent(eventId: string, organizerId: string, reason: string): Promise<EventCancellationResult> {
  if (!reason.trim()) throw new ValidationError('A cancellation reason is required');

  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('You do not have access to this event');

  if (event.status === 'cancelled') {
    throw new ValidationError('This event is already cancelled');
  }

  await event.update({ status: 'cancelled', cancellationReason: reason.trim() });

  const confirmedBookings = await Booking.findAll({ where: { eventId, status: 'confirmed' } });
  const cancelledBookings: CancellationResult[] = [];
  for (const booking of confirmedBookings) {
    // eslint-disable-next-line no-await-in-loop
    const result = await performCancellation({
      booking,
      reason: `Event cancelled by organizer: ${reason.trim()}`,
      cancelledBy: 'organizer',
      refundPercentage: 100,
    });
    cancelledBookings.push(result);
  }

  return { cancelledBookings };
}
