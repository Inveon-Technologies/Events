import { Booking, Event, Organizer, Ticket } from '../models';
import { certificateNumber, defaultCertificateDesign, type CertificateDesign, type CertificateValues } from './certificateDesign';
import { loadCertificateAssets, renderCertificatePng, renderCertificatesPdf } from './certificateRenderer';
import { getEventTicketDesign } from './ticketDesign';
import { istDateLabel, venueParts } from './bookingDocuments';

// Participation certificates: one per checked-in attendee, for events
// whose organizer switched them on. The layout is the organizer's
// (certificateDesign.ts); this module decides who gets one and fills in
// their values.

export class CertificateNotAvailableError extends Error {}

export function eventCertificateDesign(event: Event): CertificateDesign {
  return event.certificateDesign ?? defaultCertificateDesign();
}

function eventValues(event: Event, organizerName: string): Omit<CertificateValues, 'participant' | 'certificateNo'> {
  return {
    event: event.name,
    year: event.eventDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }),
    date: istDateLabel(event.eventDate),
    organizer: organizerName,
    tagline: event.tagline ?? '',
    venue: venueParts(event.venueAddress).venue,
  };
}

export interface CertificateTicket {
  ticketId: string;
  attendeeName: string;
  certificateNo: string;
}

// The booking's tickets that earn a certificate: checked in at the gate,
// on an event with certificates switched on.
export async function certificateTicketsForBooking(booking: Booking, event: Event): Promise<CertificateTicket[]> {
  if (!event.certificateEnabled || booking.status !== 'confirmed') return [];
  const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  return tickets
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.status === 'checked_in')
    .map(({ t, i }) => ({ ticketId: t.id, attendeeName: t.attendeeName, certificateNo: certificateNumber(booking.bookingReference, i) }));
}

// Loads the event's images once; the returned function renders any
// number of bookings' certificates (the post-event email loops over all).
export async function eventCertificateRenderer(event: Event): Promise<(tickets: CertificateTicket[]) => Promise<Buffer>> {
  const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name', 'logoUrl'] });
  const design = eventCertificateDesign(event);
  const { partners } = await getEventTicketDesign(event);
  const assets = await loadCertificateAssets(design, organizer?.logoUrl ?? null, partners);
  const base = eventValues(event, organizer?.name ?? 'Event Organizer');
  return (tickets) =>
    renderCertificatesPdf(
      design,
      assets,
      tickets.map((t) => ({ ...base, participant: t.attendeeName, certificateNo: t.certificateNo })),
    );
}

async function renderFor(event: Event, tickets: CertificateTicket[]): Promise<Buffer> {
  return (await eventCertificateRenderer(event))(tickets);
}

// PDF of every certificate on the booking, or just one ticket's.
export async function renderBookingCertificatesPdf(booking: Booking, ticketId?: string): Promise<{ pdf: Buffer; count: number }> {
  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new CertificateNotAvailableError('Event not found');
  let tickets = await certificateTicketsForBooking(booking, event);
  if (ticketId) tickets = tickets.filter((t) => t.ticketId === ticketId);
  if (tickets.length === 0) {
    throw new CertificateNotAvailableError(
      event.certificateEnabled
        ? 'Certificates are issued to attendees who checked in at the event.'
        : 'This event does not issue certificates.',
    );
  }
  return { pdf: await renderFor(event, tickets), count: tickets.length };
}

// The organizer's editor preview: a design (saved or not) with a sample
// attendee, placeholders visible.
export async function renderCertificatePreviewPng(event: Event, design: CertificateDesign, participant = 'Rahul Sharma'): Promise<Buffer> {
  const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name', 'logoUrl'] });
  const { partners } = await getEventTicketDesign(event);
  const assets = await loadCertificateAssets(design, organizer?.logoUrl ?? null, partners);
  const values: CertificateValues = {
    ...eventValues(event, organizer?.name ?? 'Event Organizer'),
    participant,
    certificateNo: certificateNumber('INV-BKG-2026-SAMPLE', 0),
  };
  return renderCertificatePng(design, assets, values, true);
}
