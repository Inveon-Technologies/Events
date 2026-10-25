import { enqueueNotification, registerJobHandler } from './index';
import { buildBookingEmailPayload, deliverBookingConfirmationEmail } from '../services/bookingEmails';
import { deliverBookingCancellationEmail } from '../services/bookingCancellation';
import { checkAndSendEventReminders } from '../services/eventReminders';
import { expireStalePendingOnlineBookings } from '../services/pendingBookingExpiry';
import { checkAndSendPostEventBroadcasts } from '../services/postEventBroadcast';
import { deliverWhatsApp } from '../services/whatsapp/messages';
import { deliverAttendeeTicketEmail } from '../services/attendeeTickets';
import { WHATSAPP_MESSAGES, WhatsAppMessage } from '../services/whatsapp/client';
import { isEmailConfigured } from '../services/email';
import { sendBookingPushes, BookingPushEvent } from '../services/mobileApps';
import { Booking } from '../models';
import { logger } from '../logger';

function requireString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value) throw new Error(`Job data is missing "${key}"`);
  return value;
}

// ---- notifications (retried with backoff on failure) ----

export function enqueuePush(event: BookingPushEvent, bookingId: string): Promise<void> {
  return enqueueNotification('push', { event, bookingId }, { jobId: `push-${event}-${bookingId}` });
}

// Push notifications to the mobile apps (FCM) plus their in-app inbox.
// Best effort and never retried: a push that arrives twice is worse than
// one that doesn't arrive (the inbox and email still have it).
registerJobHandler('push', async (data) => {
  await sendBookingPushes(requireString(data, 'event') as BookingPushEvent, requireString(data, 'bookingId')).catch((err) =>
    logger.warn({ err, data }, 'Mobile push failed'),
  );
});

// Also records the outcome for the ticket page's "Ticket delivered to". A
// failed attempt is recorded at once and overwritten if a retry succeeds.
registerJobHandler('booking-confirmation', async (data) => {
  const bookingId = requireString(data, 'bookingId');
  // Mobile app pushes ride along with the confirmation email. Their own
  // job id, so an email retry never pushes twice.
  void enqueuePush('booking-confirmed', bookingId);
  const record = (status: 'sent' | 'failed' | 'skipped') =>
    Booking.update({ confirmationEmailStatus: status }, { where: { id: bookingId } });
  if (!isEmailConfigured()) {
    await record('skipped');
    return;
  }
  const payload = await buildBookingEmailPayload(bookingId);
  if (!payload) return;
  try {
    await deliverBookingConfirmationEmail(payload);
    await record('sent');
  } catch (err) {
    await record('failed');
    throw err;
  }
});

registerJobHandler('booking-cancelled', async (data) => {
  void enqueuePush(data.isEventCancellation === true ? 'event-cancelled' : 'booking-cancelled', requireString(data, 'bookingId'));
  await deliverBookingCancellationEmail(requireString(data, 'bookingId'), data.isEventCancellation === true);
});

registerJobHandler('whatsapp', async (data) => {
  const message = requireString(data, 'message');
  if (!(message in WHATSAPP_MESSAGES)) throw new Error(`Unknown WhatsApp message "${message}"`);
  const ticketId = typeof data.ticketId === 'string' && data.ticketId ? data.ticketId : undefined;
  await deliverWhatsApp(message as WhatsAppMessage, requireString(data, 'bookingId'), ticketId);
});

// One attendee's own ticket email in a group booking sent separately.
registerJobHandler('attendee-ticket-email', async (data) => {
  await deliverAttendeeTicketEmail(requireString(data, 'bookingId'), requireString(data, 'ticketId'));
});

// ---- scheduled (one run per tick across all API processes) ----

registerJobHandler('event-reminders', async () => {
  await checkAndSendEventReminders();
});

registerJobHandler('pending-booking-expiry', async () => {
  const result = await expireStalePendingOnlineBookings();
  if (result.expired > 0 || result.confirmed > 0) logger.info(result, 'Pending booking sweep');
});

registerJobHandler('post-event-broadcast', async () => {
  await checkAndSendPostEventBroadcasts();
});
