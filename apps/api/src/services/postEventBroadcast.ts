import { Op } from 'sequelize';
import { Event, Booking, Ticket, Organizer } from '../models';
import { sendEmail, isEmailConfigured } from './email';
import { postEventThankYouEmail } from '../emails/templates';
import { logger } from '../logger';
import { enqueueWhatsApp } from './whatsapp/messages';

// Next-day broadcast (#57): the morning after an event, every confirmed
// booking gets a thank-you email with the organizer's photo/video link
// (if already added), a link to rate the event, and a link back to
// their bookings (where the gallery link appears whenever it's added).

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const SEND_HOUR_IST = 10;
// Events older than this are never broadcast — so switching the feature
// on doesn't email everyone who ever attended anything.
const MAX_LATENESS_MS = 3 * 24 * 60 * 60 * 1000;

// 10:00 IST on the calendar day after the event (in IST).
export function postEventSendTime(eventDate: Date): Date {
  const ist = new Date(eventDate.getTime() + IST_OFFSET_MS);
  const nextDayIstMidnightAsUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return new Date(nextDayIstMidnightAsUtc - IST_OFFSET_MS + SEND_HOUR_IST * 60 * 60 * 1000);
}

export async function findEventsNeedingPostEventEmail(now: Date = new Date()): Promise<Event[]> {
  // Coarse DB filter (the send time is at most ~2 days after the event
  // starts), then the exact rule in JS.
  const candidates = await Event.findAll({
    where: {
      status: { [Op.in]: ['published', 'closed'] },
      postEventEmailSentAt: null,
      eventDate: {
        [Op.lte]: now,
        [Op.gte]: new Date(now.getTime() - MAX_LATENESS_MS - 2 * 24 * 60 * 60 * 1000),
      },
    },
  });
  return candidates.filter((event) => {
    const sendAt = postEventSendTime(event.eventDate).getTime();
    return sendAt <= now.getTime() && now.getTime() - sendAt <= MAX_LATENESS_MS;
  });
}

function publicBaseUrl(): string | null {
  const base = process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL;
  return base ? base.replace(/\/$/, '') : null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface PostEventBroadcastResult {
  eventId: string;
  emailsSent: number;
}

// Claimed first with a conditional UPDATE, so exactly one run sends it
// (at-most-once, same trade-off as the 3-hour reminder).
export async function sendPostEventBroadcast(event: Event): Promise<PostEventBroadcastResult> {
  const result: PostEventBroadcastResult = { eventId: event.id, emailsSent: 0 };

  const [claimed] = await Event.update({ postEventEmailSentAt: new Date() }, { where: { id: event.id, postEventEmailSentAt: null } });
  if (claimed === 0) return result;

  // WhatsApp goes out per booking, independent of email.
  const confirmed = await Booking.findAll({ where: { eventId: event.id, status: 'confirmed' }, attributes: ['id'] });
  for (const booking of confirmed) {
    // eslint-disable-next-line no-await-in-loop
    await enqueueWhatsApp('postEventThanks', booking.id);
  }

  if (!isEmailConfigured()) return result;

  await event.reload();
  const organizer = await Organizer.findByPk(event.organizerId);
  const base = publicBaseUrl();
  const bookings = await Booking.findAll({ where: { eventId: event.id, status: 'confirmed' } });

  for (const booking of bookings) {
    // eslint-disable-next-line no-await-in-loop
    const tickets = await Ticket.findAll({
      where: { bookingId: booking.id, status: { [Op.ne]: 'cancelled' } },
      order: [['createdAt', 'ASC']],
    });
    if (tickets.length === 0) continue;

    try {
      const html = postEventThankYouEmail({
        attendeeName: joinNames(Array.from(new Set(tickets.map((t) => t.attendeeName)))) || booking.primaryContactName,
        eventName: event.name,
        organizerName: organizer?.name ?? 'the organizer',
        bookingReference: booking.bookingReference,
        galleryUrl: event.galleryUrl ?? null,
        galleryNote: event.galleryNote ?? null,
        feedbackUrl: base ? `${base}/bookings/${encodeURIComponent(booking.bookingReference)}/feedback` : null,
        bookingsUrl: base ? `${base}/bookings/my` : null,
      });
      // eslint-disable-next-line no-await-in-loop
      await sendEmail({
        to: booking.primaryContactEmail,
        subject: event.galleryUrl ? `Your photos from ${event.name} are here` : `Thanks for joining ${event.name}`,
        html,
      });
      result.emailsSent += 1;
    } catch (err) {
      logger.error({ err, bookingId: booking.id, eventId: event.id }, 'Failed to send post-event email');
    }
  }

  logger.info(result, 'Post-event broadcast sent');
  return result;
}

export async function checkAndSendPostEventBroadcasts(now: Date = new Date()): Promise<PostEventBroadcastResult[]> {
  const events = await findEventsNeedingPostEventEmail(now);
  const results: PostEventBroadcastResult[] = [];
  for (const event of events) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await sendPostEventBroadcast(event));
  }
  return results;
}
