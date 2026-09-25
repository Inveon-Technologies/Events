import { Booking, Event, Organizer, Payment, Ticket, TicketCategory } from '../models';
import type { EventPartner } from '../models/Event';
import { getEventTicketDesign } from './ticketDesign';
import { ticketDisplayReference, ticketPageUrl, ticketPdfUrl } from './ticketLinks';

// Everything the booking's documents (confirmation email, invoice PDF)
// print, loaded once from the booking id — always the stored values,
// never what the request happened to have in memory.

export interface BookingDocumentTicket {
  id: string;
  displayReference: string; // INV-TKT-2026-XXXXXX-01
  attendeeName: string;
  tierName: string;
  tierDescription: string | null;
  unitPricePaise: number;
  status: 'valid' | 'checked_in' | 'cancelled';
  qrToken: string;
}

export interface BookingDocumentData {
  bookingId: string;
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  bookedAt: Date;
  customer: { name: string; email: string; phone: string; city: string | null };
  event: {
    name: string;
    tagline: string | null;
    eventDate: Date;
    gateOpenTime: Date | null;
    venueAddress: string | null;
  };
  organizer: {
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    logoUrl: string | null;
    gstNumber: string | null;
    panNumber: string | null;
  };
  tickets: BookingDocumentTicket[];
  totalPaise: number;
  payment: {
    method: 'online' | 'cash';
    status: string | null;
    gatewayReference: string | null;
    paidAt: Date | null;
  };
  design: { backgroundUrl: string | null; partners: EventPartner[] };
  // Only when the site's public URL is configured — a link without a
  // host is useless in an email.
  links: { ticketPage: string | null; ticketPdf: string | null };
}

export async function loadBookingDocumentData(bookingId: string): Promise<BookingDocumentData | null> {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return null;
  const event = await Event.findByPk(booking.eventId);
  if (!event) return null;
  const organizer = await Organizer.findByPk(event.organizerId);
  const tickets = await Ticket.findAll({ where: { bookingId }, order: [['createdAt', 'ASC']] });
  if (tickets.length === 0) return null;
  const tiers = await TicketCategory.findAll({ where: { id: [...new Set(tickets.map((t) => t.ticketCategoryId))] } });
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const payment = await Payment.findOne({ where: { bookingId }, order: [['createdAt', 'DESC']] });
  const design = await getEventTicketDesign(event);
  const hasPublicUrl = Boolean(process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL);

  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
    bookingStatus: booking.status,
    bookedAt: booking.createdAt,
    customer: {
      name: booking.primaryContactName,
      email: booking.primaryContactEmail,
      phone: booking.primaryContactWhatsapp,
      city: booking.primaryContactCity,
    },
    event: {
      name: event.name,
      tagline: event.tagline,
      eventDate: event.eventDate,
      gateOpenTime: event.gateOpenTime,
      venueAddress: event.venueAddress,
    },
    organizer: {
      name: organizer?.name ?? 'Event Organizer',
      contactEmail: organizer?.contactEmail ?? null,
      contactPhone: organizer?.contactPhone ?? null,
      logoUrl: organizer?.logoUrl ?? null,
      gstNumber: organizer?.gstNumber ?? null,
      panNumber: organizer?.panNumber ?? null,
    },
    tickets: tickets.map((t, i) => {
      const tier = tierById.get(t.ticketCategoryId);
      return {
        id: t.id,
        displayReference: ticketDisplayReference(booking.bookingReference, i),
        attendeeName: t.attendeeName,
        tierName: tier?.name ?? 'General',
        tierDescription: tier?.description ?? null,
        unitPricePaise: tier?.pricePaise ?? 0,
        status: t.status,
        qrToken: t.qrToken,
      };
    }),
    totalPaise: booking.totalAmountPaise,
    payment: {
      method: payment?.method ?? booking.paymentMethod,
      status: payment?.status ?? null,
      gatewayReference: payment?.gatewayReference ?? null,
      paidAt: payment?.status === 'paid' ? (payment.verifiedAt ?? payment.updatedAt) : null,
    },
    design: { backgroundUrl: design.backgroundUrl, partners: design.partners },
    links: {
      ticketPage: hasPublicUrl ? ticketPageUrl(booking.bookingReference) : null,
      ticketPdf: hasPublicUrl ? ticketPdfUrl(booking.bookingReference) : null,
    },
  };
}

// "Venue, Street, City, State, 411001" → { venue, city }.
export function venueParts(address: string | null): { venue: string; city: string } {
  const pieces = (address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { venue: 'Venue to be announced', city: '' };
  const withoutPin = pieces.filter((p) => !/^\d{6}$/.test(p));
  const city = withoutPin.length > 2 ? withoutPin[withoutPin.length - 2] : withoutPin.length === 2 ? withoutPin[1] : '';
  return { venue: pieces[0], city };
}

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

export function istDateLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'long', year: 'numeric' });
}
export function istWeekday(d: Date): string {
  return d.toLocaleDateString('en-IN', { ...IST, weekday: 'long' });
}
export function istTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
}
