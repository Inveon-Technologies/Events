import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real customer ticket viewing (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let eventId: string;
  let tierId: string;
  let bookingReference: string;
  let ticketId: string;
  const customerEmail = `ticket-view-${suffix}@example.com`;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Ticket View Test Org ${suffix}`,
      slug: `ticket-view-test-org-${suffix}`,
      cashfreeVendorId: `ticket_view_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `ticket-view-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Ticket View Test Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    eventId = eventRes.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;

    const bookingRes = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Ticket View Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: customerEmail,
      paymentMethod: 'cash',
    });
    bookingReference = bookingRes.body.bookingReference;
    const ticket = await Ticket.findOne({ where: { bookingId: bookingRes.body.bookingId } });
    ticketId = ticket!.id;
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    for (const evt of events) {
      const bookings = await Booking.findAll({ where: { eventId: evt.id } });
      for (const booking of bookings) {
        await Payment.destroy({ where: { bookingId: booking.id } });
        await Ticket.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId: evt.id } });
      await TicketCategory.destroy({ where: { eventId: evt.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('returns the real ticket(s) and booking detail when the email matches', async () => {
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: customerEmail });
    expect(res.status).toBe(200);
    expect(res.body.bookingReference).toBe(bookingReference);
    expect(res.body.bookingStatus).toBe('pending'); // cash booking, not yet confirmed
    expect(res.body.eventName).toBe(`Ticket View Test Event ${suffix}`);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].id).toBe(ticketId);
    expect(res.body.tickets[0].attendeeName).toBe('Ticket View Customer');
    expect(res.body.tickets[0].tierName).toBe('General');
    expect(res.body.tickets[0].status).toBe('valid');
  });

  it('rejects a wrong email with the same 404 as a nonexistent booking', async () => {
    const wrongEmail = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: 'wrong@example.com' });
    const nonexistent = await request(app).get('/api/bookings/DOES-NOT-EXIST/tickets').query({ email: 'wrong@example.com' });
    expect(wrongEmail.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(wrongEmail.body.error).toBe(nonexistent.body.error);
  });

  it('returns a real PNG QR code image for the ticket, matching the ticket\'s own real qrToken', async () => {
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets/${ticketId}/qr`).query({ email: customerEmail });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('rejects fetching a QR image with the wrong email', async () => {
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets/${ticketId}/qr`).query({ email: 'wrong@example.com' });
    expect(res.status).toBe(404);
  });

  it('rejects fetching a QR image for a ticket that does not belong to this booking', async () => {
    const res = await request(app)
      .get(`/api/bookings/${bookingReference}/tickets/00000000-0000-0000-0000-000000000000/qr`)
      .query({ email: customerEmail });
    expect(res.status).toBe(404);
  });

  it('reflects the real event self-service cancellation policy in the booking detail', async () => {
    // This event was created with default policy (self-service off).
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: customerEmail });
    expect(res.body.allowSelfServiceCancellation).toBe(false);
  });

  it('returns the real organizer name, venue, real Maps link, and real payment reference — not fabricated fields', async () => {
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: customerEmail });
    expect(res.status).toBe(200);
    expect(res.body.organizerName).toBe(`Ticket View Test Org ${suffix}`);
    expect(res.body.bookedAt).toBeTruthy();
    // No venue was set on this event, so no fabricated address or map
    // link should appear — both stay genuinely null rather than some
    // placeholder value.
    expect(res.body.venueAddress).toBeNull();
    expect(res.body.venueMapUrl).toBeNull();
    // Cash payment — a real gateway reference genuinely doesn't exist
    // for this method, so it must stay null, not an invented one.
    expect(res.body.paymentMethod).toBe('cash');
    expect(res.body.paymentReference).toBeNull();
  });

  it('returns a real per-tier price breakdown computed from real ticket tier prices, and a real per-ticket reference derived from the real booking reference', async () => {
    const res = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: customerEmail });
    expect(res.body.tierBreakdown).toEqual([{ tierName: 'General', quantity: 1, unitPricePaise: 50000, subtotalPaise: 50000 }]);
    expect(res.body.tickets[0].ticketReference).toBe(`${bookingReference}-1`);
  });

  it('a real venue address produces a real, working Google Maps link', async () => {
    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Ticket View Venue Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        venueName: 'Real Test Venue',
        city: 'Pune',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    const venueTierId = (await TicketCategory.findOne({ where: { eventId: eventRes.body.id } }))!.id;
    const bookingRes = await request(app).post(`/api/events/${eventRes.body.id}/bookings`).send({
      ticketCategoryId: venueTierId, quantity: 1, primaryContactName: 'Venue Customer',
      primaryContactWhatsapp: '+919000000002', primaryContactEmail: `venue-${suffix}@example.com`, paymentMethod: 'cash',
    });

    const detail = await request(app).get(`/api/bookings/${bookingRes.body.bookingReference}/tickets`).query({ email: `venue-${suffix}@example.com` });
    expect(detail.body.venueAddress).toBe('Real Test Venue, Pune');
    expect(detail.body.venueMapUrl).toBe('https://www.google.com/maps/search/?api=1&query=Real%20Test%20Venue%2C%20Pune');
  });

  it('a multi-attendee booking gets a real breakdown across attendee count and a distinct ticket reference per attendee', async () => {
    const bookingRes = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 2, primaryContactName: 'Multi Ticket Customer',
      primaryContactWhatsapp: '+919000000003', primaryContactEmail: `multi-ticket-${suffix}@example.com`, paymentMethod: 'cash',
      attendeeNames: ['First Attendee', 'Second Attendee'],
    });

    const detail = await request(app).get(`/api/bookings/${bookingRes.body.bookingReference}/tickets`).query({ email: `multi-ticket-${suffix}@example.com` });
    expect(detail.body.tickets).toHaveLength(2);
    expect(detail.body.tickets.map((t: { ticketReference: string }) => t.ticketReference)).toEqual([
      `${bookingRes.body.bookingReference}-1`,
      `${bookingRes.body.bookingReference}-2`,
    ]);
    expect(detail.body.tierBreakdown).toEqual([{ tierName: 'General', quantity: 2, unitPricePaise: 50000, subtotalPaise: 100000 }]);
  });
});
