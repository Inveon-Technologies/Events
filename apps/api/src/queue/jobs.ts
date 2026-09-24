import { registerJobHandler } from './index';
import { buildBookingEmailPayload, deliverBookingConfirmationEmail } from '../services/bookingEmails';
import { deliverBookingCancellationEmail } from '../services/bookingCancellation';
import { checkAndSendEventReminders } from '../services/eventReminders';
import { expireStalePendingOnlineBookings } from '../services/pendingBookingExpiry';
import { checkAndSendPostEventBroadcasts } from '../services/postEventBroadcast';
import { logger } from '../logger';

function requireString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value) throw new Error(`Job data is missing "${key}"`);
  return value;
}

// ---- notifications (retried with backoff on failure) ----

registerJobHandler('booking-confirmation', async (data) => {
  const payload = await buildBookingEmailPayload(requireString(data, 'bookingId'));
  if (payload) await deliverBookingConfirmationEmail(payload);
});

registerJobHandler('booking-cancelled', async (data) => {
  await deliverBookingCancellationEmail(requireString(data, 'bookingId'), data.isEventCancellation === true);
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
