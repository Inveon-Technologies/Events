import { Op } from 'sequelize';
import { sequelize } from '../db/connection';
import { Event, Booking, Payment, User } from '../models';
import { releaseBookingTickets } from './bookingTickets';
import { cashfreeCreateRefund } from './cashfreeClient';
import { sendEmail, isEmailConfigured } from './email';
import { bookingCancellationEmail, eventCancelledOrganizerSummaryEmail } from '../emails/templates';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

// Emails are read in India — format in IST explicitly rather than in
// whatever timezone the server/container happens to run in (UTC in
// Docker), which showed customers the wrong time.
function formatEventDateLabel(date: Date): string {
  return date.toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

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
  event: Event;
  reason: string;
  cancelledBy: 'customer' | 'organizer';
  isEventCancellation: boolean;
  refundPercentage: number;
}): Promise<CancellationResult> {
  const { booking, event } = params;
  // Nothing was ever collected for a still-pending booking, so there's
  // nothing to refund, whatever the policy says.
  const wasPaid = booking.status === 'confirmed';
  const refundAmountPaise = wasPaid ? Math.round(booking.totalAmountPaise * (params.refundPercentage / 100)) : 0;

  await sequelize.transaction(async (t) => {
    // The status check and the change are one conditional UPDATE, so
    // two concurrent cancellations of the same booking (a double-click,
    // or customer and organizer at once) can't both proceed — the loser
    // matches zero rows. Checking booking.status in JS first and then
    // updating let both through, releasing the tickets twice
    // (overselling) and firing two refunds.
    const [count] = await Booking.update(
      {
        status: 'cancelled',
        cancellationReason: params.reason,
        cancelledBy: params.cancelledBy,
        refundAmountPaise,
        refundStatus: refundAmountPaise > 0 ? 'pending' : null,
      },
      { where: { id: booking.id, status: booking.status }, transaction: t },
    );
    if (count === 0) throw new ValidationError('This booking cannot be cancelled');

    await releaseBookingTickets(booking.id, t);
  });
  await booking.reload();

  let refundStatus: string | null = null;

  if (refundAmountPaise > 0) {
    const payment = await Payment.findOne({ where: { bookingId: booking.id } });
    // A cash booking, or an online booking with no recorded gateway
    // order (shouldn't happen for a real confirmed online booking, but
    // defends against it anyway) — nothing to call Cashfree about; the
    // organizer handles that refund manually outside this system.
    if (payment && payment.method === 'online' && payment.gatewayReference) {
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
    }
  }

  // Best-effort, deliberately never throws — matches the same pattern
  // as sendBookingConfirmationEmail: a failed or unconfigured email
  // send must never undo or block a cancellation that's already been
  // committed to the database.
  if (isEmailConfigured()) {
    try {
      const html = bookingCancellationEmail({
        customerName: booking.primaryContactName,
        eventName: event.name,
        eventDateLabel: formatEventDateLabel(event.eventDate),
        bookingReference: booking.bookingReference,
        reason: params.reason,
        cancelledByEventCancellation: params.isEventCancellation,
        cancelledByOrganizer: params.cancelledBy === 'organizer',
        totalPaise: booking.totalAmountPaise,
        refundAmountPaise,
        refundStatus,
      });
      await sendEmail({
        to: booking.primaryContactEmail,
        subject: params.isEventCancellation
          ? `Event cancelled: ${event.name} (${booking.bookingReference})`
          : `Booking cancelled: ${event.name} (${booking.bookingReference})`,
        html,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to send cancellation email for ${booking.bookingReference}:`, err);
    }
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
    event,
    reason: reason.trim(),
    cancelledBy: 'customer',
    isEventCancellation: false,
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
  return performCancellation({ booking, event, reason: reason.trim(), cancelledBy: 'organizer', isEventCancellation: false, refundPercentage: 100 });
}

export interface EventCancellationResult {
  cancelledBookings: CancellationResult[];
  // Bookings that couldn't be cancelled this run — calling
  // organizerCancelEvent again retries them.
  failedBookingIds: string[];
}

export async function organizerCancelEvent(eventId: string, organizerId: string, reason: string): Promise<EventCancellationResult> {
  if (!reason.trim()) throw new ValidationError('A cancellation reason is required');

  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('You do not have access to this event');

  // Every booking still active on the event: confirmed ones (refunded
  // in full) and pending ones (nothing collected yet — cancelled so a
  // late online payment or a cash handover can't confirm a seat at an
  // event that isn't happening).
  const activeBookings = await Booking.findAll({ where: { eventId, status: { [Op.in]: ['confirmed', 'pending'] } } });

  // Resumable: an event already marked cancelled whose earlier run
  // failed partway still has active bookings, and calling this again
  // finishes the job instead of refusing with "already cancelled".
  if (event.status === 'cancelled' && activeBookings.length === 0) {
    throw new ValidationError('This event is already cancelled');
  }

  // Marked cancelled first so no new booking can start while the
  // existing ones are being cancelled (bookingCreation.ts only accepts
  // published events).
  if (event.status !== 'cancelled') {
    await event.update({ status: 'cancelled', cancellationReason: reason.trim() });
  }

  const cancelledBookings: CancellationResult[] = [];
  const failedBookingIds: string[] = [];
  for (const booking of activeBookings) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await performCancellation({
        booking,
        event,
        reason: `Event cancelled by organizer: ${reason.trim()}`,
        cancelledBy: 'organizer',
        isEventCancellation: true,
        refundPercentage: 100,
      });
      cancelledBookings.push(result);
    } catch (err) {
      // One booking failing (e.g. it was concurrently cancelled, or a
      // DB hiccup) must not stop every other attendee from being
      // cancelled and refunded. The organizer can re-run this to retry.
      if (!(err instanceof ValidationError)) {
        // eslint-disable-next-line no-console
        console.error(`Failed to cancel booking ${booking.id} during event cancellation ${eventId}:`, err);
        failedBookingIds.push(booking.id);
      }
    }
  }

  // Best-effort summary to the organizer confirming what just happened —
  // same never-throws pattern as the per-customer email above, since a
  // failed notification here must never make the cancellation itself
  // look like it failed.
  if (isEmailConfigured()) {
    try {
      const owner = await User.findOne({ where: { organizerId, role: 'organizer_owner' } });
      if (owner) {
        const totalRefundedPaise = cancelledBookings.reduce((sum, r) => sum + r.refundAmountPaise, 0);
        const html = eventCancelledOrganizerSummaryEmail({
          organizerContactName: owner.name ?? 'there',
          eventName: event.name,
          eventDateLabel: formatEventDateLabel(event.eventDate),
          reason: reason.trim(),
          cancelledBookingsCount: cancelledBookings.length,
          totalRefundedPaise,
        });
        await sendEmail({
          to: owner.email,
          subject: `You cancelled ${event.name} — ${cancelledBookings.length} booking(s) refunded`,
          html,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to send organizer cancellation summary for event ${eventId}:`, err);
    }
  }

  return { cancelledBookings, failedBookingIds };
}
