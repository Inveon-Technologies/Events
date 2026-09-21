import request from 'supertest';
import { Op } from 'sequelize';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, Event, TicketCategory, Booking, Ticket } from '../../src/models';

const QUOTA = 5;
const CONCURRENT_REQUESTS = 15; // 3x the quota — deliberately way oversubscribed

describe('booking concurrency: atomic quota reservation (BE-11 / QA-01)', () => {
  const app = createApp();
  let organizer: Organizer;
  let event: Event;
  let ticketCategory: TicketCategory;

  beforeAll(async () => {
    organizer = await Organizer.create({
      name: 'Concurrency Test Organizer',
      slug: `concurrency-test-${Date.now()}`,
    });
    event = await Event.create({
      organizerId: organizer.id,
      name: 'Concurrency Test Event',
      eventDate: new Date(Date.now() + 30 * 86400000),
      capacity: QUOTA,
      status: 'published',
    });
    ticketCategory = await TicketCategory.create({
      eventId: event.id,
      name: 'General',
      pricePaise: 10000,
      quotaTotal: QUOTA,
      quotaRemaining: QUOTA,
    });
  });

  afterAll(async () => {
    // Respect bookings.event_id's ON DELETE RESTRICT — same explicit
    // teardown order as the seed script, for the same reason.
    const bookingIds = (await Booking.findAll({ where: { eventId: event.id }, attributes: ['id'] })).map((b) => b.id);
    await Ticket.destroy({ where: { bookingId: bookingIds } });
    await Booking.destroy({ where: { id: bookingIds } });
    await TicketCategory.destroy({ where: { id: ticketCategory.id } });
    await Event.destroy({ where: { id: event.id } });
    await Organizer.destroy({ where: { id: organizer.id } });
    await sequelize.close();
  });

  it(`allows exactly ${QUOTA} of ${CONCURRENT_REQUESTS} simultaneous requests to succeed, never more`, async () => {
    const makeRequest = (i: number) =>
      request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send({
          ticketCategoryId: ticketCategory.id,
          quantity: 1,
          primaryContactName: `Concurrent Buyer ${i}`,
          primaryContactWhatsapp: `+91900000${String(i).padStart(4, '0')}`,
          primaryContactEmail: `buyer${i}@example.com`,
          // 'cash', deliberately — this test is about the atomic quota
          // reservation itself (identical for either payment method),
          // not the Cashfree order-creation path that now follows an
          // 'online' booking in production. That path makes a real
          // network call to Cashfree, which isn't mocked here and isn't
          // reachable from every environment this suite runs in.
          paymentMethod: 'cash',
        });

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => makeRequest(i)),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const soldOut = responses.filter((r) => r.status === 409);

    // The core guarantee: exactly QUOTA succeed. Not QUOTA-1 (which would
    // mean the lock is overly conservative), not QUOTA+1 (which would mean
    // it oversold) — exactly QUOTA.
    expect(succeeded.length).toBe(QUOTA);
    expect(soldOut.length).toBe(CONCURRENT_REQUESTS - QUOTA);
    expect(succeeded.length + soldOut.length).toBe(CONCURRENT_REQUESTS);

    // Every successful response returned a distinct booking — not the same
    // booking double-counted.
    const bookingIds = new Set(succeeded.map((r) => r.body.bookingId));
    expect(bookingIds.size).toBe(QUOTA);

    // And the database itself agrees — this is the actual source of
    // truth, not just what the HTTP layer reported.
    const refreshedCategory = await TicketCategory.findByPk(ticketCategory.id);
    expect(refreshedCategory?.quotaRemaining).toBe(0);

    const realTicketCount = await Ticket.count({
      where: { ticketCategoryId: ticketCategory.id, status: { [Op.ne]: 'cancelled' } },
    });
    expect(realTicketCount).toBe(QUOTA);

    const realBookingCount = await Booking.count({ where: { eventId: event.id } });
    expect(realBookingCount).toBe(QUOTA);
  });
});
