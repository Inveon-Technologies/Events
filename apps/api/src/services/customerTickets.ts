import { Booking, Event, Organizer, Payment, Ticket, TicketCategory } from '../models';
import type { EventLocationPoint } from '../models/Event';
import { generateTicketQrPng } from './qrCode';
import { buildVenueMapUrl } from './mapsUrl';
import { ticketPageUrl, verifyTicketLinkToken } from './ticketLinks';
import { contactMatchesBooking, findBookingByReference, parseLoginContact, type LoginContact } from './customerAuth';

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
  locationPoints: EventLocationPoint[] | null;
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
  // Shareable link to this booking's ticket page (no login needed).
  ticketPageUrl: string;
  // How the confirmation reached the customer: 'sent' | 'failed' |
  // 'skipped' (channel not set up), or null while not attempted yet.
  delivery: { email: string | null; whatsapp: string | null };
}

// `contact` is the booking's email or mobile number; the reference is
// matched case-insensitively (see customerAuth.ts).
async function findVerifiedBooking(bookingReference: string, contact: string): Promise<Booking> {
  const booking = await findBookingByReference(bookingReference);
  let parsed: LoginContact | null = null;
  try {
    parsed = parseLoginContact(contact);
  } catch {
    parsed = null;
  }
  if (!booking || !parsed || !contactMatchesBooking(booking, parsed)) {
    throw new NotFoundError('Booking not found');
  }
  return booking;
}

export async function getBookingDetail(bookingReference: string, email: string): Promise<CustomerBookingDetail> {
  return buildBookingDetail(await findVerifiedBooking(bookingReference, email));
}

// The ticket page behind a signed link (see ticketLinks.ts) — the link
// itself is the proof of access, no email needed.
export async function getBookingDetailByToken(token: string): Promise<CustomerBookingDetail> {
  return buildBookingDetail(await findBookingByToken(token));
}

export async function findBookingByToken(token: string): Promise<Booking> {
  const reference = verifyTicketLinkToken(token);
  const booking = reference ? await Booking.findOne({ where: { bookingReference: reference } }) : null;
  if (!booking) throw new NotFoundError('Ticket not found');
  return booking;
}

export async function buildBookingDetail(booking: Booking): Promise<CustomerBookingDetail> {
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
    locationPoints: event.locationPoints ?? null,
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
    ticketPageUrl: ticketPageUrl(booking.bookingReference),
    delivery: { email: booking.confirmationEmailStatus ?? null, whatsapp: booking.confirmationWhatsappStatus ?? null },
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
  return qrForBookingTicket(await findVerifiedBooking(bookingReference, email), ticketId);
}

export async function getTicketQrImageByToken(token: string, ticketId: string): Promise<Buffer> {
  return qrForBookingTicket(await findBookingByToken(token), ticketId);
}

async function qrForBookingTicket(booking: Booking, ticketId: string): Promise<Buffer> {

  const ticket = await Ticket.findOne({ where: { id: ticketId, bookingId: booking.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return generateTicketQrPng(ticket.qrToken);
}
