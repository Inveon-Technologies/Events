import { Booking, Event, Organizer, Payment, Ticket } from '../../models';
import { ticketCardUrl, ticketLinkToken } from '../ticketLinks';
import { ticketDisplayReference } from '../ticketArtwork';
import { buildVenueMapUrl } from '../mapsUrl';
import { enqueueNotification } from '../../queue';
import { isWhatsAppConfigured, sendWhatsAppTemplate, WhatsAppInvalidNumberError, WhatsAppMessage } from './client';
import { logger } from '../../logger';
import { certificateTicketsForBooking } from '../certificates';

// What each WhatsApp message says. The params are listed in the order of
// the template's {{1}}, {{2}}, … — the approved template texts are in
// docs/ops/WHATSAPP.md and must stay in step with these.

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

function publicBaseUrl(): string {
  const base = process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '';
  return base.replace(/\/$/, '');
}

function myBookingsUrl(): string {
  const base = publicBaseUrl();
  return base ? `${base}/bookings/my` : 'our website';
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

type Built = {
  recipientName: string;
  to: string;
  params: string[];
  headerImage?: { url: string; filename: string };
  urlButtons?: string[];
} | null;

function shortPlace(text: string | null | undefined): string {
  return text ? text.split(',')[0].trim() : '';
}

// "Pune → Rajgad" when there's a pickup point (same rule as the ticket card).
function locationLine(event: Event): string {
  const venue = shortPlace(event.venueAddress);
  const pickup = event.locationPoints?.find((p) => p.type === 'pickup' || p.type === 'meeting');
  if (pickup && venue && shortPlace(pickup.label) !== venue) return `${shortPlace(pickup.label)} → ${venue}`;
  return venue || shortPlace(pickup?.label) || 'See your ticket page';
}

// Exported for the send-test script (scripts/whatsappTest.ts). With a
// ticketId, the confirmation goes to that ticket's own attendee instead
// of the buyer (group bookings sent separately, see attendeeTickets.ts).
export async function buildWhatsAppMessage(message: WhatsAppMessage, booking: Booking, event: Event, ticketId?: string): Promise<Built> {
  if (ticketId) return message === 'bookingConfirmation' ? buildAttendeeConfirmation(booking, event, ticketId) : null;
  const name = booking.primaryContactName;
  const base = { recipientName: name, to: booking.primaryContactWhatsapp };

  switch (message) {
    case 'bookingConfirmation': {
      if (booking.status === 'cancelled') return null;
      if (!publicBaseUrl()) throw new Error('WEB_PUBLIC_URL must be set to send the WhatsApp ticket (its image and buttons are links)');
      const all = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']], attributes: ['status'] });
      const active = all
        .map((t, i) => ({ t, ref: ticketDisplayReference(booking.bookingReference, i) }))
        .filter(({ t }) => t.status !== 'cancelled');
      const tickets =
        active.length <= 1
          ? (active[0]?.ref ?? '-')
          : `${active[0].ref} to -${active[active.length - 1].ref.split('-').pop()} (${active.length} tickets)`;
      const payment = await Payment.findOne({
        where: { bookingId: booking.id },
        order: [['createdAt', 'DESC']],
        attributes: ['status', 'method'],
      });
      const status =
        booking.totalAmountPaise === 0
          ? 'Your ticket is ready.'
          : booking.status === 'pending' && payment?.method === 'cash'
            ? `Please pay ${rupees(booking.totalAmountPaise)} at the venue; your ticket is ready.`
            : 'Your payment has been verified and your ticket is ready.';
      const token = ticketLinkToken(booking.bookingReference);
      // 🎟️ *Booking Confirmed!* Hi {{1}}, your booking for *{{2}}* is confirmed. {{3}}
      // 📅 {{4}}  ⏰ {{5}}  📍 {{6}}  🎫 Ticket ID: {{7}}  🧾 Booking ID: {{8}}  📞 Organizer: {{9}}
      // Show the QR code … (fixed last line: WhatsApp won't approve a body that ends with a variable)
      // Buttons: View Ticket → /t/{{1}}, Download Ticket PDF → /api/ticket-pdf/{{1}}
      return {
        ...base,
        params: [
          name,
          event.name,
          status,
          ...(await confirmationDetails(event)),
          tickets,
          booking.bookingReference,
          await organizerHelp(event),
        ],
        headerImage: { url: ticketCardUrl(booking.bookingReference), filename: `Ticket-${booking.bookingReference}.png` },
        urlButtons: [token, token],
      };
    }
    case 'eventReminder': {
      if (booking.status !== 'confirmed') return null;
      const time = event.eventDate.toLocaleString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' });
      const map = buildVenueMapUrl(event.venueAddress, event.venueMapUrl, event.venueLatitude, event.venueLongitude);
      // Hi {{1}}, a reminder that {{2}} starts today at {{3}}. Venue: {{4}}. Directions: {{5}}.
      // Keep your QR code ready for check-in (booking ref {{6}}). …
      return {
        ...base,
        params: [name, event.name, time, event.venueAddress || 'see the event page', map || myBookingsUrl(), booking.bookingReference],
      };
    }
    case 'bookingCancelled': {
      if (booking.status !== 'cancelled') return null;
      // Online refunds go back through Cashfree automatically; cash ones (and
      // any that Cashfree rejected) are settled by the organizer by hand.
      const automatic = booking.paymentMethod === 'online' && booking.refundStatus?.toLowerCase() !== 'failed';
      const refund = !booking.refundAmountPaise
        ? 'No payment was due for this booking.'
        : automatic
          ? `A refund of ${rupees(booking.refundAmountPaise)} has been started to your original payment method.`
          : `A refund of ${rupees(booking.refundAmountPaise)} is due; the organizer will arrange it with you.`;
      // Hi {{1}}, your booking {{2}} for {{3}} has been cancelled. {{4}} …
      return { ...base, params: [name, booking.bookingReference, event.name, refund] };
    }
    case 'postEventThanks': {
      if (booking.status !== 'confirmed') return null;
      const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name'] });
      const base2 = publicBaseUrl();
      const photos = event.galleryUrl
        ? `See the photos and videos here: ${event.galleryUrl}`
        : 'Photos and videos will appear on your booking page soon.';
      const feedback = base2 ? `${base2}/bookings/${encodeURIComponent(booking.bookingReference)}/feedback` : myBookingsUrl();
      // Hi {{1}}, thank you for joining {{2}} with {{3}}! {{4}} Please rate your experience at {{5}}. …
      return { ...base, params: [name, event.name, organizer?.name ?? 'us', photos, feedback] };
    }
    case 'certificateReady': {
      // Hi {{1}}, thank you for attending {{2}}! … Button: Download Certificate → /api/certificates/{{1}}
      if (booking.status !== 'confirmed' || !publicBaseUrl()) return null;
      if ((await certificateTicketsForBooking(booking, event)).length === 0) return null;
      return { ...base, params: [name, event.name], urlButtons: [ticketLinkToken(booking.bookingReference)] };
    }
    default:
      return null;
  }
}

// {{4}} date and {{5}} time, then {{6}} place, of the confirmation.
function confirmationDetails(event: Event): [string, string, string] {
  const reporting = event.gateOpenTime ?? event.eventDate;
  return [
    event.eventDate.toLocaleDateString('en-IN', { ...IST, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    `${event.gateOpenTime ? 'Reporting time' : 'Starts at'}: ${reporting.toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' }).toUpperCase()}`,
    locationLine(event),
  ];
}

// {{9}} of the confirmation.
async function organizerHelp(event: Event): Promise<string> {
  const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name', 'contactPhone'] });
  return organizer?.contactPhone
    ? `${organizer.name}, ${organizer.contactPhone}`
    : `${organizer?.name ?? 'Event organizer'} (contact details on your ticket page)`;
}

// The same booking_confirmation template, for one attendee of a group
// booking: their name, their one ticket, and a link that opens only that
// ticket (so they never see the others' QR codes or the buyer's details).
async function buildAttendeeConfirmation(booking: Booking, event: Event, ticketId: string): Promise<Built> {
  if (booking.status === 'cancelled') return null;
  if (!publicBaseUrl()) throw new Error('WEB_PUBLIC_URL must be set to send the WhatsApp ticket (its image and buttons are links)');
  const all = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  const index = all.findIndex((t) => t.id === ticketId);
  const ticket = all[index];
  if (!ticket || ticket.status === 'cancelled' || !ticket.attendeeWhatsapp) return null;
  const payment = await Payment.findOne({ where: { bookingId: booking.id }, order: [['createdAt', 'DESC']], attributes: ['method'] });
  const bookedBy = `${booking.primaryContactName} booked this ticket for you`;
  const status =
    booking.status === 'pending' && booking.totalAmountPaise > 0 && payment?.method === 'cash'
      ? `${bookedBy}; payment is due at the venue. Your ticket is ready.`
      : `${bookedBy}. Your ticket is ready.`;
  const token = ticketLinkToken(booking.bookingReference, ticket.id);
  return {
    recipientName: ticket.attendeeName,
    to: ticket.attendeeWhatsapp,
    params: [
      ticket.attendeeName,
      event.name,
      status,
      ...confirmationDetails(event),
      ticketDisplayReference(booking.bookingReference, index),
      booking.bookingReference,
      await organizerHelp(event),
    ],
    headerImage: {
      url: ticketCardUrl(booking.bookingReference, ticket.id),
      filename: `Ticket-${ticketDisplayReference(booking.bookingReference, index)}.png`,
    },
    urlButtons: [token, token],
  };
}

// Job handler for "whatsapp" (queue/jobs.ts). Throws on a provider error so
// the queue retries; a number that can never work is logged and dropped.
// With a ticketId it is that attendee's own copy (no booking status is
// recorded for it: the ticket page's "Ticket delivered to" is the buyer's).
export async function deliverWhatsApp(message: WhatsAppMessage, bookingId: string, ticketId?: string): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return;
  const event = await Event.findByPk(booking.eventId);
  if (!event) return;

  const built = await buildWhatsAppMessage(message, booking, event, ticketId);
  if (!built) return;

  // The confirmation's outcome is shown on the ticket page ("Ticket
  // delivered to"). A failed attempt is recorded straight away and
  // overwritten if a retry succeeds.
  const record = (status: 'sent' | 'failed') =>
    message === 'bookingConfirmation' && !ticketId
      ? Booking.update({ confirmationWhatsappStatus: status }, { where: { id: bookingId } })
      : null;

  try {
    await sendWhatsAppTemplate({ message, ...built });
    await record('sent');
  } catch (err) {
    await record('failed');
    if (err instanceof WhatsAppInvalidNumberError) {
      logger.warn({ bookingId, ticketId, message }, err.message);
      return;
    }
    throw err;
  }
}

// Fire-and-forget from request code and scheduled jobs; a no-op unless
// WhatsApp is configured. One job per booking and message, so a repeated
// webhook or reminder run can't send it twice.
export async function enqueueWhatsApp(message: WhatsAppMessage, bookingId: string, jobSuffix = '', ticketId?: string): Promise<void> {
  if (!isWhatsAppConfigured()) {
    if (message === 'bookingConfirmation' && !ticketId) {
      await Booking.update({ confirmationWhatsappStatus: 'skipped' }, { where: { id: bookingId } });
    }
    return;
  }
  await enqueueNotification('whatsapp', ticketId ? { message, bookingId, ticketId } : { message, bookingId }, {
    jobId: `whatsapp-${message}-${bookingId}${ticketId ? `-${ticketId}` : ''}${jobSuffix}`,
  });
}
