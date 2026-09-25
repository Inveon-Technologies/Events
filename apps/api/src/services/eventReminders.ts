import { Op } from 'sequelize';
import { Event, Booking, Ticket } from '../models';
import { sendEmail, isEmailConfigured } from './email';
import { eventReminderEmail } from '../emails/templates';
import { buildVenueMapUrl } from './mapsUrl';
import { logger } from '../logger';

const REMINDER_LEAD_TIME_MS = 3 * 60 * 60 * 1000; // 3 hours

// Threshold-based, not a tight timing window: "is this event now within
// 3 hours of starting" rather than "is it starting in exactly the next
// 5 minutes". A tight window would silently skip an event forever if
// the server was ever down or slow across that exact moment; this
// stays correct even after downtime, and reminder_sent_at (checked
// here and set once sent) is what actually guarantees a reminder is
// never sent twice, not the window's precision.
export async function findEventsNeedingReminder(): Promise<Event[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_LEAD_TIME_MS);
  return Event.findAll({
    where: {
      status: 'published',
      reminderSentAt: null,
      eventDate: { [Op.gt]: now, [Op.lte]: cutoff },
    },
  });
}

export interface ReminderSendResult {
  eventId: string;
  // One email per booking, to its primary contact — the only address
  // this system has for any attendee on it.
  emailsSent: number;
  // Tickets those emails covered (every non-cancelled attendee).
  attendeesCovered: number;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Claims the event first with a conditional UPDATE (reminder_sent_at
// still NULL -> now), then sends. With more than one API process (or
// two overlapping polls) running, exactly one claim succeeds, so a
// reminder can never go out twice. The trade-off is at-most-once: a
// crash mid-batch leaves the rest unsent rather than re-sending to
// everyone, which is the right side to err on for a reminder.
//
// One email per booking, not per ticket — every ticket's only address
// is the booking's primary contact, so per-ticket sends just gave that
// person N identical emails. The one email greets every attendee on
// the booking by name instead.
export async function sendEventReminder(event: Event): Promise<ReminderSendResult> {
  const result: ReminderSendResult = { eventId: event.id, emailsSent: 0, attendeesCovered: 0 };

  const [claimed] = await Event.update(
    { reminderSentAt: new Date() },
    { where: { id: event.id, reminderSentAt: null } },
  );
  if (claimed === 0) return result;

  if (!isEmailConfigured()) return result;

  const bookings = await Booking.findAll({ where: { eventId: event.id, status: 'confirmed' } });
  const mapUrl = buildVenueMapUrl(event.venueAddress, event.venueMapUrl, event.venueLatitude, event.venueLongitude);
  const eventTimeLabel = event.eventDate.toLocaleString('en-IN', {
    weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  for (const booking of bookings) {
    // eslint-disable-next-line no-await-in-loop
    const tickets = await Ticket.findAll({
      where: { bookingId: booking.id, status: { [Op.ne]: 'cancelled' } },
      order: [['createdAt', 'ASC']],
    });
    if (tickets.length === 0) continue;

    const attendeeNames = Array.from(new Set(tickets.map((t) => t.attendeeName)));
    try {
      const html = eventReminderEmail({
        attendeeName: joinNames(attendeeNames),
        eventName: event.name,
        bookingReference: booking.bookingReference,
        eventTimeLabel,
        venueAddress: event.venueAddress,
        mapUrl,
      });
      // eslint-disable-next-line no-await-in-loop
      await sendEmail({ to: booking.primaryContactEmail, subject: `${event.name} starts in 3 hours`, html });
      result.emailsSent += 1;
      result.attendeesCovered += tickets.length;
    } catch (err) {
      logger.error({ err, bookingId: booking.id, eventId: event.id }, 'Failed to send event reminder');
    }
  }

  return result;
}

// The single entry point the poller calls — finds every event that
// needs one and sends them, one event at a time so a slow or failing
// event's email batch never blocks another event's real attendees
// from getting theirs on time.
export async function checkAndSendEventReminders(): Promise<ReminderSendResult[]> {
  const events = await findEventsNeedingReminder();
  const results: ReminderSendResult[] = [];
  for (const event of events) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await sendEventReminder(event));
  }
  return results;
}
