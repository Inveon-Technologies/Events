import { Booking, Event, Ticket, TicketCategory } from '../models';
import { generateTicketQrPng } from './qrCode';

export class NotFoundError extends Error {}

export interface CustomerTicketRow {
  id: string;
  attendeeName: string;
  tierName: string;
  status: 'valid' | 'checked_in' | 'cancelled';
}

export interface CustomerBookingDetail {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventName: string;
  eventDate: string;
  totalAmountPaise: number;
  refundAmountPaise: number | null;
  refundStatus: string | null;
  allowSelfServiceCancellation: boolean;
  refundCutoffPassed: boolean;
  tickets: CustomerTicketRow[];
}

// Same enumeration-safe verification as the feedback and cancellation
// endpoints: a wrong email gets the identical "not found" a nonexistent
// booking would, so a real booking reference can't be confirmed to
// exist by trial and error.
async function findVerifiedBooking(bookingReference: string, email: string): Promise<Booking> {
  const booking = await Booking.findOne({ where: { bookingReference: bookingReference.trim() } });
  if (!booking || booking.primaryContactEmail.toLowerCase() !== email.trim().toLowerCase()) {
    throw new NotFoundError('Booking not found');
  }
  return booking;
}

export async function getBookingDetail(bookingReference: string, email: string): Promise<CustomerBookingDetail> {
  const booking = await findVerifiedBooking(bookingReference, email);
  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('Booking not found');

  const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  const tiers = await TicketCategory.findAll({ where: { id: tickets.map((t) => t.ticketCategoryId) } });
  const tierNameById = new Map(tiers.map((t) => [t.id, t.name]));

  const refundCutoffPassed =
    event.refundCutoffDays !== null
      ? Date.now() > event.eventDate.getTime() - event.refundCutoffDays * 24 * 60 * 60 * 1000
      : true;

  return {
    bookingReference: booking.bookingReference,
    bookingStatus: booking.status,
    eventName: event.name,
    eventDate: event.eventDate.toISOString(),
    totalAmountPaise: booking.totalAmountPaise,
    refundAmountPaise: booking.refundAmountPaise,
    refundStatus: booking.refundStatus,
    allowSelfServiceCancellation: event.allowSelfServiceCancellation,
    refundCutoffPassed,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      attendeeName: ticket.attendeeName,
      tierName: tierNameById.get(ticket.ticketCategoryId) ?? 'General',
      status: ticket.status,
    })),
  };
}

export async function getTicketQrImage(bookingReference: string, email: string, ticketId: string): Promise<Buffer> {
  const booking = await findVerifiedBooking(bookingReference, email);

  const ticket = await Ticket.findOne({ where: { id: ticketId, bookingId: booking.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  // The QR image is generated fresh from the ticket's qrToken every
  // time it's requested, never cached or stored as a file — there's
  // nothing to go stale, and it stays correct even for a ticket that's
  // since been cancelled (the image itself carries no status; whether
  // it's accepted is entirely decided at check-in time, by
  // ticketCheckIn.ts reading the ticket's real current status).
  return generateTicketQrPng(ticket.qrToken);
}
