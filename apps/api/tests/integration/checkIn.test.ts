import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real check-in system (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let userId: string;
  let otherToken: string;
  let eventId: string;
  let otherEventId: string;
  let tierId: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Checkin Test Org ${suffix}`,
      slug: `checkin-test-org-${suffix}`,
      cashfreeVendorId: `checkin_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `checkin-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    userId = user.id;
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({
      name: `Other Checkin Org ${suffix}`,
      slug: `other-checkin-org-${suffix}`,
    });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: `other-checkin-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Checkin Test Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    eventId = eventRes.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;

    const otherEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Other Checkin Test Event ${suffix}`,
        startDate: '2026-12-26',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    otherEventId = otherEventRes.body.id;
  });

  afterAll(async () => {
    for (const evId of [eventId, otherEventId]) {
      const bookings = await Booking.findAll({ where: { eventId: evId } });
      for (const booking of bookings) {
        await Payment.destroy({ where: { bookingId: booking.id } });
        await Ticket.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId: evId } });
      await TicketCategory.destroy({ where: { eventId: evId } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  async function createConfirmedBooking(email: string) {
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Checkin Test Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'cash',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
    const ticket = await Ticket.findOne({ where: { bookingId: res.body.bookingId } });
    return { bookingId: res.body.bookingId as string, ticket: ticket! };
  }

  it('checks in a real, valid ticket and returns the real attendee/booking details', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-ok-${suffix}@example.com`);

    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: ticket.qrToken });
    expect(res.status).toBe(200);
    expect(res.body.attendeeName).toBe('Checkin Test Customer');
    expect(res.body.tierName).toBe('General');

    const dbTicket = await Ticket.findByPk(ticket.id);
    expect(dbTicket!.status).toBe('checked_in');
    expect(dbTicket!.checkedInByUserId).toBe(userId);
    expect(dbTicket!.checkedInAt).not.toBeNull();
  });

  it('MOST IMPORTANT: rejects a cancelled ticket\'s real QR code — the actual place a refunded booking\'s ticket stops working', async () => {
    const { bookingId, ticket } = await createConfirmedBooking(`checkin-cancelled-${suffix}@example.com`);

    const cancelRes = await request(app)
      .post(`/api/organizer/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Testing QR rejection after cancellation' });
    expect(cancelRes.status).toBe(200);

    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: ticket.qrToken });
    expect(res.status).toBe(409);
    expect(res.body.reasonCode).toBe('cancelled');
    expect(res.body.error).toMatch(/cancelled/i);

    const dbTicket = await Ticket.findByPk(ticket.id);
    expect(dbTicket!.status).toBe('cancelled');
    expect(dbTicket!.checkedInAt).toBeNull();
  });

  it('rejects a duplicate scan of an already-checked-in ticket', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-dup-${suffix}@example.com`);
    await request(app).post(`/api/organizer/events/${eventId}/checkin`).set('Authorization', `Bearer ${token}`).send({ qrToken: ticket.qrToken });

    const secondScan = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: ticket.qrToken });
    expect(secondScan.status).toBe(409);
    expect(secondScan.body.reasonCode).toBe('already_checked_in');
  });

  it('rejects a ticket scanned at the wrong event, naming the real event it belongs to', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-wrongevent-${suffix}@example.com`);

    const res = await request(app)
      .post(`/api/organizer/events/${otherEventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: ticket.qrToken });
    expect(res.status).toBe(409);
    expect(res.body.reasonCode).toBe('wrong_event');
    expect(res.body.error).toMatch(/Checkin Test Event/);
  });

  it('404s cleanly for a QR code that matches no real ticket', async () => {
    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: 'not-a-real-qr-token' });
    expect(res.status).toBe(404);
  });

  it('refuses to check in a ticket belonging to another organizer\'s event', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-forbidden-${suffix}@example.com`);
    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ qrToken: ticket.qrToken });
    expect(res.status).toBe(403);
  });

  it('undo check-in restores the ticket to valid, and it can be checked in again after', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-undo-${suffix}@example.com`);
    await request(app).post(`/api/organizer/events/${eventId}/checkin`).set('Authorization', `Bearer ${token}`).send({ qrToken: ticket.qrToken });

    const undoRes = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin/${ticket.id}/undo`)
      .set('Authorization', `Bearer ${token}`);
    expect(undoRes.status).toBe(200);

    const dbTicket = await Ticket.findByPk(ticket.id);
    expect(dbTicket!.status).toBe('valid');
    expect(dbTicket!.checkedInAt).toBeNull();

    const rescan = await request(app)
      .post(`/api/organizer/events/${eventId}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: ticket.qrToken });
    expect(rescan.status).toBe(200);
  });

  it('manual check-in from the roster by ticket id follows the same rules as a scan', async () => {
    const { ticket } = await createConfirmedBooking(`checkin-manual-${suffix}@example.com`);

    const first = await request(app).post(`/api/organizer/events/${eventId}/checkin/ticket/${ticket.id}`).set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.attendeeName).toBe('Checkin Test Customer');

    const again = await request(app).post(`/api/organizer/events/${eventId}/checkin/ticket/${ticket.id}`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
    expect(again.body.reasonCode).toBe('already_checked_in');

    const otherOrg = await request(app).post(`/api/organizer/events/${eventId}/checkin/ticket/${ticket.id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(otherOrg.status).toBe(403);
  });
});
