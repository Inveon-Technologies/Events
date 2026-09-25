import { Op } from 'sequelize';
import { Booking, Event, Organizer, Ticket } from '../../models';
import { buildVenueMapUrl } from '../mapsUrl';
import { enqueueNotification } from '../../queue';
import { isWhatsAppConfigured, sendWhatsAppTemplate, WhatsAppInvalidNumberError, WhatsAppMessage } from './client';
import { logger } from '../../logger';

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

function dateLabel(date: Date): string {
  return date.toLocaleString('en-IN', {
    ...IST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function activeTicketCount(bookingId: string): Promise<number> {
  return Ticket.count({ where: { bookingId, status: { [Op.ne]: 'cancelled' } } });
}

type Built = { recipientName: string; to: string; params: string[] } | null;

async function build(message: WhatsAppMessage, booking: Booking, event: Event): Promise<Built> {
  const name = booking.primaryContactName;
  const base = { recipientName: name, to: booking.primaryContactWhatsapp };

  switch (message) {
    case 'bookingConfirmation': {
      if (booking.status === 'cancelled') return null;
      const tickets = await activeTicketCount(booking.id);
      // Hi {{1}}, your booking for {{2}} on {{3}} is confirmed. Booking ref: {{4}}, tickets: {{5}}.
      // View your tickets and QR codes at {{6}} and show the QR code at entry. …
      return {
        ...base,
        params: [name, event.name, dateLabel(event.eventDate), booking.bookingReference, String(tickets), myBookingsUrl()],
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
    default:
      return null;
  }
}

// Job handler for "whatsapp" (queue/jobs.ts). Throws on a provider error so
// the queue retries; a number that can never work is logged and dropped.
export async function deliverWhatsApp(message: WhatsAppMessage, bookingId: string): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return;
  const event = await Event.findByPk(booking.eventId);
  if (!event) return;

  const built = await build(message, booking, event);
  if (!built) return;

  try {
    await sendWhatsAppTemplate({ message, ...built });
  } catch (err) {
    if (err instanceof WhatsAppInvalidNumberError) {
      logger.warn({ bookingId, message }, err.message);
      return;
    }
    throw err;
  }
}

// Fire-and-forget from request code and scheduled jobs; a no-op unless
// WhatsApp is configured. One job per booking and message, so a repeated
// webhook or reminder run can't send it twice.
export async function enqueueWhatsApp(message: WhatsAppMessage, bookingId: string, jobSuffix = ''): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await enqueueNotification('whatsapp', { message, bookingId }, { jobId: `whatsapp-${message}-${bookingId}${jobSuffix}` });
}
