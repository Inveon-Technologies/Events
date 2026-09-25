import { registerJobHandler } from './index';
import { buildBookingEmailPayload, deliverBookingConfirmationEmail } from '../services/bookingEmails';
import { deliverBookingCancellationEmail } from '../services/bookingCancellation';
import { checkAndSendEventReminders } from '../services/eventReminders';
import { expireStalePendingOnlineBookings } from '../services/pendingBookingExpiry';
import { checkAndSendPostEventBroadcasts } from '../services/postEventBroadcast';
import { deliverWhatsApp } from '../services/whatsapp/messages';
import { WHATSAPP_MESSAGES, WhatsAppMessage } from '../services/whatsapp/client';
import { isEmailConfigured } from '../services/email';
import { Booking } from '../models';
import { logger } from '../logger';

function requireString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value) throw new Error(`Job data is missing "${key}"`);
  return value;
}

// ---- notifications (retried with backoff on failure) ----

// Also records the outcome for the ticket page's "Ticket delivered to". A
// failed attempt is recorded at once and overwritten if a retry succeeds.
registerJobHandler('booking-confirmation', async (data) => {
  const bookingId = requireString(data, 'bookingId');
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
  await deliverBookingCancellationEmail(requireString(data, 'bookingId'), data.isEventCancellation === true);
});

registerJobHandler('whatsapp', async (data) => {
  const message = requireString(data, 'message');
  if (!(message in WHATSAPP_MESSAGES)) throw new Error(`Unknown WhatsApp message "${message}"`);
  await deliverWhatsApp(message as WhatsAppMessage, requireString(data, 'bookingId'));
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
