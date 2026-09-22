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
    const bookings = await Booking.findAll({ where: { eventId } });
    for (const booking of bookings) {
      await Payment.destroy({ where: { bookingId: booking.id } });
      await Ticket.destroy({ where: { bookingId: booking.id } });
    }
    await Booking.destroy({ where: { eventId } });
    await TicketCategory.destroy({ where: { eventId } });
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
});
