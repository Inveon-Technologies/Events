import { Ticket, Booking, Event, TicketCategory } from '../models';

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class RejectedError extends Error {
  constructor(
    message: string,
    public readonly reasonCode: 'cancelled' | 'already_checked_in' | 'wrong_event' | 'booking_not_confirmed',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface CheckInResult {
  ticketId: string;
  attendeeName: string;
  tierName: string;
  bookingReference: string;
  checkedInAt: string;
}

// This is the actual place a cancelled or refunded ticket's QR code
// gets rejected — the QR image itself only ever encodes the ticket's
// qrToken (see qrCode.ts), never a status, so whatever the ticket's
// real, current, live status is in the database is the only thing
// that can possibly reject it here. There is no cached or embedded
// "valid as of issue time" signal to go stale.
export async function checkInTicket(params: {
  eventId: string;
  organizerId: string;
  qrToken: string;
  checkedInByUserId: string;
}): Promise<CheckInResult> {
  const ticket = await Ticket.findOne({ where: { qrToken: params.qrToken.trim() } });
  if (!ticket) {
    throw new NotFoundError('No ticket found for this QR code');
  }

  const booking = await Booking.findByPk(ticket.bookingId);
  if (!booking) throw new NotFoundError('No ticket found for this QR code');

  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('No ticket found for this QR code');

  if (event.organizerId !== params.organizerId) {
    throw new ForbiddenError('This ticket does not belong to one of your events');
  }

  if (event.id !== params.eventId) {
    throw new RejectedError(`This ticket is for a different event: "${event.name}"`, 'wrong_event', { actualEventName: event.name });
  }

  // A ticket can only reach 'cancelled' by its booking having been
  // cancelled (see bookingCancellation.ts, which cancels every ticket
  // in a booking atomically alongside the booking itself) — checking
  // the ticket's own status is sufficient, but the booking status is
  // checked too as a second, independent signal rather than trusting
  // ticket.status alone to have never drifted from it.
  if (ticket.status === 'cancelled' || booking.status === 'cancelled') {
    throw new RejectedError('This ticket has been cancelled and is no longer valid for entry', 'cancelled');
  }

  if (booking.status !== 'confirmed') {
    throw new RejectedError('This booking was never confirmed — nothing to check in', 'booking_not_confirmed');
  }

  if (ticket.status === 'checked_in') {
    throw new RejectedError(
      `This ticket was already checked in at ${ticket.checkedInAt?.toISOString()}`,
      'already_checked_in',
      { checkedInAt: ticket.checkedInAt?.toISOString() },
    );
  }

  // Conditional on the ticket still being 'valid' at write time, not
  // just when it was read above — two gates scanning the same QR at the
  // same moment would otherwise both pass the check and both admit it.
  // Exactly one UPDATE matches; the other gets the same rejection as a
  // plain duplicate scan.
  const checkedInAt = new Date();
  const [count] = await Ticket.update(
    { status: 'checked_in', checkedInAt, checkedInByUserId: params.checkedInByUserId },
    { where: { id: ticket.id, status: 'valid' } },
  );
  if (count === 0) {
    const current = await Ticket.findByPk(ticket.id);
    if (current?.status === 'cancelled') {
      throw new RejectedError('This ticket has been cancelled and is no longer valid for entry', 'cancelled');
    }
    throw new RejectedError(
      `This ticket was already checked in at ${current?.checkedInAt?.toISOString()}`,
      'already_checked_in',
      { checkedInAt: current?.checkedInAt?.toISOString() },
    );
  }

  const tier = await TicketCategory.findByPk(ticket.ticketCategoryId);

  return {
    ticketId: ticket.id,
    attendeeName: ticket.attendeeName,
    tierName: tier?.name ?? 'General',
    bookingReference: booking.bookingReference,
    checkedInAt: checkedInAt.toISOString(),
  };
}

// Manual check-in from the organizer's attendee roster (e.g. a guest
// whose phone died), by ticket id instead of a scanned QR. Same rules
// and the same race-safe update as a scan — it simply looks up the
// ticket's QR token first.
export async function checkInTicketById(params: {
  eventId: string;
  organizerId: string;
  ticketId: string;
  checkedInByUserId: string;
}): Promise<CheckInResult> {
  const ticket = await Ticket.findByPk(params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  return checkInTicket({
    eventId: params.eventId,
    organizerId: params.organizerId,
    qrToken: ticket.qrToken,
    checkedInByUserId: params.checkedInByUserId,
  });
}

export interface UndoCheckInResult {
  ticketId: string;
}

export async function undoCheckIn(eventId: string, organizerId: string, ticketId: string): Promise<UndoCheckInResult> {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');

  const booking = await Booking.findByPk(ticket.bookingId);
  if (!booking) throw new NotFoundError('Ticket not found');

  const event = await Event.findByPk(booking.eventId);
  if (!event || event.id !== eventId) throw new NotFoundError('Ticket not found for this event');
  if (event.organizerId !== organizerId) throw new ForbiddenError('This ticket does not belong to one of your events');

  if (ticket.status !== 'checked_in') {
    throw new RejectedError('This ticket was not checked in', 'already_checked_in');
  }

  const [count] = await Ticket.update(
    { status: 'valid', checkedInAt: null, checkedInByUserId: null },
    { where: { id: ticket.id, status: 'checked_in' } },
  );
  if (count === 0) {
    throw new RejectedError('This ticket was not checked in', 'already_checked_in');
  }
  return { ticketId: ticket.id };
}
