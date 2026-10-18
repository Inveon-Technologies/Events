import { Booking, Event, Organizer, Payment, Ticket, TicketCategory } from '../models';
import type { EventLocationPoint, EventPartner } from '../models/Event';
import { getEventTicketDesign } from './ticketDesign';
import { generateTicketQrPng } from './qrCode';
import { buildVenueMapUrl } from './mapsUrl';
import { parseTicketLinkToken, ticketDisplayReference, ticketLinkToken, ticketPageUrl } from './ticketLinks';
import { contactMatchesBooking, findBookingByReference, parseLoginContact, type LoginContact } from './customerAuth';

export class NotFoundError extends Error {}

export interface CustomerTicketRow {
  id: string;
  ticketReference: string;
  // As printed on the ticket: INV-TKT-2026-XXXXXX-01.
  displayReference: string;
  attendeeName: string;
  // A participation certificate can be downloaded for this ticket
  // (event issues them and the attendee checked in).
  certificateAvailable: boolean;
  // Same-origin download link for that certificate, when available.
  certificateUrl: string | null;
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
  // Title background chosen by the organizer (falls back to the cover
  // photo) and their Partners & Supporters, for the ticket design.
  ticketBackgroundUrl: string | null;
  partners: EventPartner[];
  organizerName: string;
  organizerLogoUrl: string | null;
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
  // The event issues participation certificates (to checked-in
  // attendees), and a link to all of this booking's in one PDF.
  certificatesEnabled: boolean;
  certificatesUrl: string | null;
  // How the confirmation reached the customer: 'sent' | 'failed' |
  // 'skipped' (channel not set up), or null while not attempted yet.
  delivery: { email: string | null; whatsapp: string | null };
  // 'ticket' when opened from a link sent to one attendee of a group
  // booking: only their ticket, none of the buyer's contact or payment
  // details. bookedBy is then the buyer's name.
  scope: 'booking' | 'ticket';
  bookedBy: string | null;
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
// itself is the proof of access, no email needed. A one-ticket link
// shows only that ticket.
export async function getBookingDetailByToken(token: string): Promise<CustomerBookingDetail> {
  const { booking, ticketId } = await resolveTicketLink(token);
  return buildBookingDetail(booking, ticketId);
}

// The booking a link opens, and the one ticket it is limited to (null
// for a booking-wide link).
export async function resolveTicketLink(token: string): Promise<{ booking: Booking; ticketId: string | null }> {
  const parsed = parseTicketLinkToken(token);
  const booking = parsed ? await Booking.findOne({ where: { bookingReference: parsed.bookingReference } }) : null;
  if (!parsed || !booking) throw new NotFoundError('Ticket not found');
  if (parsed.ticketId && !(await Ticket.count({ where: { id: parsed.ticketId, bookingId: booking.id } }))) {
    throw new NotFoundError('Ticket not found');
  }
  return { booking, ticketId: parsed.ticketId };
}

export async function findBookingByToken(token: string): Promise<Booking> {
  return (await resolveTicketLink(token)).booking;
}

export async function buildBookingDetail(booking: Booking, onlyTicketId: string | null = null): Promise<CustomerBookingDetail> {
  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('Booking not found');
  const organizer = await Organizer.findByPk(event.organizerId);

  // Numbered by position in the whole booking, so a one-ticket view still
  // prints the same ticket ID as the buyer's copy.
  const allTickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  const position = new Map(allTickets.map((t, i) => [t.id, i]));
  const tickets = onlyTicketId ? allTickets.filter((t) => t.id === onlyTicketId) : allTickets;
  const scoped = Boolean(onlyTicketId);
  const tiers = await TicketCategory.findAll({ where: { id: tickets.map((t) => t.ticketCategoryId) } });
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  const payment = await Payment.findOne({ where: { bookingId: booking.id }, order: [['createdAt', 'DESC']] });
  const design = await getEventTicketDesign(event);

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

  const linkToken = ticketLinkToken(booking.bookingReference, onlyTicketId ?? undefined);
  const breakdown = Array.from(breakdownByTier.values());
  const certificateTickets = tickets.filter(
    (ticket) => event.certificateEnabled && booking.status === 'confirmed' && ticket.status === 'checked_in',
  );

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
    bannerUrl: design.coverUrl,
    ticketBackgroundUrl: design.backgroundUrl,
    partners: design.partners,
    organizerName: organizer?.name ?? 'Event Organizer',
    organizerLogoUrl: organizer?.logoUrl ?? null,
    organizerContactEmail: organizer?.contactEmail ?? null,
    organizerContactPhone: organizer?.contactPhone ?? null,
    packingChecklist: event.packingChecklist,
    locationPoints: event.locationPoints ?? null,
    cancellationPolicyText: event.cancellationPolicy,
    primaryContactName: booking.primaryContactName,
    primaryContactEmail: scoped ? '' : booking.primaryContactEmail,
    primaryContactWhatsapp: scoped ? '' : booking.primaryContactWhatsapp,
    totalAmountPaise: scoped ? breakdown.reduce((sum, r) => sum + r.subtotalPaise, 0) : booking.totalAmountPaise,
    paymentMethod: payment?.method ?? null,
    paymentStatus: payment?.status ?? null,
    paymentReference: scoped ? null : (payment?.gatewayReference ?? null),
    tierBreakdown: breakdown,
    refundAmountPaise: scoped ? null : booking.refundAmountPaise,
    refundStatus: booking.refundStatus,
    allowSelfServiceCancellation: scoped ? false : event.allowSelfServiceCancellation,
    refundCutoffDays: event.refundCutoffDays,
    refundPercentage: event.refundPercentage,
    refundCutoffPassed,
    galleryUrl: booking.status === 'confirmed' ? event.galleryUrl ?? null : null,
    galleryNote: booking.status === 'confirmed' ? event.galleryNote ?? null : null,
    ticketPageUrl: ticketPageUrl(booking.bookingReference, onlyTicketId ?? undefined),
    delivery: { email: booking.confirmationEmailStatus ?? null, whatsapp: booking.confirmationWhatsappStatus ?? null },
    certificatesEnabled: Boolean(event.certificateEnabled) && booking.status === 'confirmed',
    certificatesUrl: certificateTickets.length > 0 ? `/api/certificates/${linkToken}` : null,
    scope: scoped ? 'ticket' : 'booking',
    bookedBy: scoped ? booking.primaryContactName : null,
    tickets: tickets.map((ticket) => {
      const i = position.get(ticket.id) ?? 0;
      return {
        id: ticket.id,
        ticketReference: `${booking.bookingReference}-${i + 1}`,
        displayReference: ticketDisplayReference(booking.bookingReference, i),
        certificateAvailable: certificateTickets.includes(ticket),
        certificateUrl: certificateTickets.includes(ticket) ? `/api/t/${linkToken}/tickets/${ticket.id}/certificate.pdf` : null,
        attendeeName: ticket.attendeeName,
        tierName: tierById.get(ticket.ticketCategoryId)?.name ?? 'General',
        status: ticket.status,
        checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
      };
    }),
  };
}

export async function getTicketQrImage(bookingReference: string, email: string, ticketId: string): Promise<Buffer> {
  return qrForBookingTicket(await findVerifiedBooking(bookingReference, email), ticketId);
}

export async function getTicketQrImageByToken(token: string, ticketId: string): Promise<Buffer> {
  const link = await resolveTicketLink(token);
  if (link.ticketId && link.ticketId !== ticketId) throw new NotFoundError('Ticket not found');
  return qrForBookingTicket(link.booking, ticketId);
}

async function qrForBookingTicket(booking: Booking, ticketId: string): Promise<Buffer> {

  const ticket = await Ticket.findOne({ where: { id: ticketId, bookingId: booking.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return generateTicketQrPng(ticket.qrToken);
}
