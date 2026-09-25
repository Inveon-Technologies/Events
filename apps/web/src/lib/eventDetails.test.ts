import { describe, it, expect } from 'vitest';
import { applyAvailability, EventDetails } from './eventDetails';

describe('applyAvailability', () => {
  const event = {
    availableSeats: 5,
    ticketCategories: [
      { id: 'a', name: 'General', description: '', price: 100, maxPerBooking: 5, available: 3 },
      { id: 'b', name: 'VIP', description: '', price: 500, maxPerBooking: 2, available: 2 },
    ],
  } as unknown as EventDetails;

  it('updates the live seat counts and the total', () => {
    const next = applyAvailability(event, [
      { id: 'a', available: 0 },
      { id: 'b', available: 1 },
    ]);
    expect(next.ticketCategories.map((t) => t.available)).toEqual([0, 1]);
    expect(next.availableSeats).toBe(1);
  });

  it('keeps the same object when nothing changed, so the page does not re-render', () => {
    expect(applyAvailability(event, [{ id: 'a', available: 3 }])).toBe(event);
  });
});
