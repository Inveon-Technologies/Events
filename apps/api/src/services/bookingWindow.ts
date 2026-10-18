import { parseIstDateTime } from './istTime';

// When an event stops taking bookings: the organizer's "booking open
// until" if set, else the event's start (the original rule). Every check
// that used to compare eventDate with "now" for booking purposes goes
// through here, so a multi-day event stays bookable everywhere at once.
export function bookingClosesAt(event: { eventDate: Date; bookingClosesAt?: Date | null }): Date {
  return event.bookingClosesAt ?? event.eventDate;
}

export function isBookingOpen(event: { eventDate: Date; bookingClosesAt?: Date | null }, now: Date = new Date()): boolean {
  return bookingClosesAt(event).getTime() > now.getTime();
}

export class BookingWindowError extends Error {}

// Organizer form input -> stored value. Empty date clears it (back to
// "closes at start"); a date with no time means the end of that day, IST.
// undefined means the field wasn't sent at all.
export function parseBookingClosesAt(date?: string | null, time?: string | null): Date | null | undefined {
  if (date === undefined && time === undefined) return undefined;
  const d = (date ?? '').trim();
  if (!d) return null;
  const t = (time ?? '').trim() || '23:59';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
    throw new BookingWindowError('Invalid "booking open until" date/time');
  }
  const parsed = parseIstDateTime(d, t);
  if (Number.isNaN(parsed.getTime())) throw new BookingWindowError('Invalid "booking open until" date/time');
  return parsed;
}
