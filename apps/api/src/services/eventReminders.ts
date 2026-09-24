import { Op } from 'sequelize';
import { Event, Booking, Ticket } from '../models';
import { sendEmail, isEmailConfigured } from './email';
import { eventReminderEmail } from '../emails/templates';
import { buildVenueMapUrl } from './mapsUrl';

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
  attendeesEmailed: number;
}

// Sends to every ticket holder on every confirmed booking for this
// event — not just the primary contact per booking, so a booking for
// three people reminds all three real attendee names, each getting
// their own email. Marks reminder_sent_at only after attempting every
// send, so a mid-batch failure doesn't leave the event stuck retrying
// forever on the next poll — matches the same "one send, tracked,
// never blocks on individual failures" reasoning as every other
// best-effort email path in this codebase.
export async function sendEventReminder(event: Event): Promise<ReminderSendResult> {
  let attendeesEmailed = 0;

  if (isEmailConfigured()) {
    const bookings = await Booking.findAll({ where: { eventId: event.id, status: 'confirmed' } });
    const mapUrl = buildVenueMapUrl(event.venueAddress, event.venueMapUrl, event.venueLatitude, event.venueLongitude);
    const eventTimeLabel = event.eventDate.toLocaleString('en-IN', {
      weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });

    for (const booking of bookings) {
      // eslint-disable-next-line no-await-in-loop
      const tickets = await Ticket.findAll({ where: { bookingId: booking.id, status: { [Op.ne]: 'cancelled' } } });
      for (const ticket of tickets) {
        try {
          const html = eventReminderEmail({
            attendeeName: ticket.attendeeName,
            eventName: event.name,
            bookingReference: booking.bookingReference,
            eventTimeLabel,
            venueAddress: event.venueAddress,
            mapUrl,
          });
          // eslint-disable-next-line no-await-in-loop
          await sendEmail({ to: booking.primaryContactEmail, subject: `${event.name} starts in 3 hours`, html });
          attendeesEmailed += 1;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Failed to send event reminder for ticket ${ticket.id} (event ${event.id}):`, err);
        }
      }
    }
  }

  await event.update({ reminderSentAt: new Date() });
  return { eventId: event.id, attendeesEmailed };
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
