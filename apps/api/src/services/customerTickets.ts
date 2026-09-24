import { Booking, Event, Organizer, Payment, Ticket, TicketCategory } from '../models';
import { generateTicketQrPng } from './qrCode';
import { buildVenueMapUrl } from './mapsUrl';

export class NotFoundError extends Error {}

export interface CustomerTicketRow {
  id: string;
  ticketReference: string;
  attendeeName: string;
  tierName: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
}

export interface CustomerTierBreakdownRow {
  tierName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
}

export interface CustomerBookingDetail {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  bookedAt: string;
  eventName: string;
  eventTagline: string | null;
  eventDate: string;
  gateOpenTime: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  bannerUrl: string | null;
  organizerName: string;
  organizerContactEmail: string | null;
  organizerContactPhone: string | null;
  packingChecklist: { item: string; mandatory: boolean }[] | null;
  cancellationPolicyText: string | null;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactWhatsapp: string;
  totalAmountPaise: number;
  paymentMethod: 'online' | 'cash' | null;
  paymentStatus: string | null;
  paymentReference: string | null;
  tierBreakdown: CustomerTierBreakdownRow[];
  refundAmountPaise: number | null;
  refundStatus: string | null;
  allowSelfServiceCancellation: boolean;
  refundCutoffDays: number | null;
  refundPercentage: number | null;
  refundCutoffPassed: boolean;
  tickets: CustomerTicketRow[];
  // The organizer's post-event photos & videos link — only for a
  // confirmed booking (attendees), never for a cancelled one.
  galleryUrl: string | null;
  galleryNote: string | null;
}

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
  const organizer = await Organizer.findByPk(event.organizerId);

  const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  const tiers = await TicketCategory.findAll({ where: { id: tickets.map((t) => t.ticketCategoryId) } });
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  const payment = await Payment.findOne({ where: { bookingId: booking.id }, order: [['createdAt', 'DESC']] });

  const refundCutoffPassed =
    event.refundCutoffDays !== null
      ? Date.now() > event.eventDate.getTime() - event.refundCutoffDays * 24 * 60 * 60 * 1000
      : true;

  const breakdownByTier = new Map<string, CustomerTierBreakdownRow>();
  for (const ticket of tickets) {
    const tier = tierById.get(ticket.ticketCategoryId);
    const tierName = tier?.name ?? 'General';
    const unitPricePaise = tier?.pricePaise ?? 0;
    const existing = breakdownByTier.get(tierName);
    if (existing) {
      existing.quantity += 1;
      existing.subtotalPaise += unitPricePaise;
    } else {
      breakdownByTier.set(tierName, { tierName, quantity: 1, unitPricePaise, subtotalPaise: unitPricePaise });
    }
  }

  return {
    bookingReference: booking.bookingReference,
    bookingStatus: booking.status,
    bookedAt: booking.createdAt.toISOString(),
    eventName: event.name,
    eventTagline: event.tagline,
    eventDate: event.eventDate.toISOString(),
    gateOpenTime: event.gateOpenTime?.toISOString() ?? null,
    venueAddress: event.venueAddress,
    venueMapUrl: buildVenueMapUrl(event.venueAddress, event.venueMapUrl, event.venueLatitude, event.venueLongitude),
    bannerUrl: event.bannerUrl,
    organizerName: organizer?.name ?? 'Event Organizer',
    organizerContactEmail: organizer?.contactEmail ?? null,
    organizerContactPhone: organizer?.contactPhone ?? null,
    packingChecklist: event.packingChecklist,
    cancellationPolicyText: event.cancellationPolicy,
    primaryContactName: booking.primaryContactName,
    primaryContactEmail: booking.primaryContactEmail,
    primaryContactWhatsapp: booking.primaryContactWhatsapp,
    totalAmountPaise: booking.totalAmountPaise,
    paymentMethod: payment?.method ?? null,
    paymentStatus: payment?.status ?? null,
    paymentReference: payment?.gatewayReference ?? null,
    tierBreakdown: Array.from(breakdownByTier.values()),
    refundAmountPaise: booking.refundAmountPaise,
    refundStatus: booking.refundStatus,
    allowSelfServiceCancellation: event.allowSelfServiceCancellation,
    refundCutoffDays: event.refundCutoffDays,
    refundPercentage: event.refundPercentage,
    refundCutoffPassed,
    galleryUrl: booking.status === 'confirmed' ? event.galleryUrl ?? null : null,
    galleryNote: booking.status === 'confirmed' ? event.galleryNote ?? null : null,
    tickets: tickets.map((ticket, i) => ({
      id: ticket.id,
      ticketReference: `${booking.bookingReference}-${i + 1}`,
      attendeeName: ticket.attendeeName,
      tierName: tierById.get(ticket.ticketCategoryId)?.name ?? 'General',
      status: ticket.status,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    })),
  };
}

export async function getTicketQrImage(bookingReference: string, email: string, ticketId: string): Promise<Buffer> {
  const booking = await findVerifiedBooking(bookingReference, email);

  const ticket = await Ticket.findOne({ where: { id: ticketId, bookingId: booking.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return generateTicketQrPng(ticket.qrToken);
}
