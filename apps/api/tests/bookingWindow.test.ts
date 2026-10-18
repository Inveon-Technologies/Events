import { bookingClosesAt, isBookingOpen, parseBookingClosesAt, BookingWindowError } from '../src/services/bookingWindow';
import { deriveEventStatus } from '../src/services/organizerEvents';

describe('booking window ("booking open until")', () => {
  const now = new Date('2026-12-16T06:00:00.000Z');
  const started = new Date('2026-12-15T03:30:00.000Z');

  it('closes at the start when no "booking open until" is set', () => {
    expect(bookingClosesAt({ eventDate: started, bookingClosesAt: null })).toEqual(started);
    expect(isBookingOpen({ eventDate: started, bookingClosesAt: null }, now)).toBe(false);
  });

  it("stays open after the start until the organizer's cutoff", () => {
    const until = new Date('2026-12-18T12:30:00.000Z');
    expect(isBookingOpen({ eventDate: started, bookingClosesAt: until }, now)).toBe(true);
    expect(isBookingOpen({ eventDate: started, bookingClosesAt: until }, new Date('2026-12-18T12:30:00.000Z'))).toBe(false);
  });

  it('parses India time, defaults a missing time to 23:59, and clears on an empty date', () => {
    expect(parseBookingClosesAt('2026-12-18', '18:00')).toEqual(new Date('2026-12-18T12:30:00.000Z'));
    expect(parseBookingClosesAt('2026-12-18', '')).toEqual(new Date('2026-12-18T18:29:00.000Z'));
    expect(parseBookingClosesAt('', '10:00')).toBeNull();
    expect(parseBookingClosesAt(null, null)).toBeNull();
    expect(parseBookingClosesAt(undefined, undefined)).toBeUndefined();
    expect(() => parseBookingClosesAt('2026-12-18', '25:00')).toThrow(BookingWindowError);
  });

  it('keeps a started event "published" on the organizer dashboard while booking is open', () => {
    expect(deriveEventStatus('published', started, now)).toBe('completed');
    expect(deriveEventStatus('published', started, now, new Date('2026-12-18T12:30:00.000Z'))).toBe('published');
  });
});
