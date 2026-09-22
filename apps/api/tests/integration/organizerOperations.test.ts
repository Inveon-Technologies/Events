import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real organizer operations pages: tickets + payments (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let emptyOrgToken: string;
  let eventId: string;
  let tierId: string;

  const originalFeePercent = process.env.PLATFORM_FEE_PERCENT;

  beforeAll(async () => {
    process.env.PLATFORM_FEE_PERCENT = '0';
    const organizer = await Organizer.create({
      name: `Ops Test Org ${suffix}`,
      slug: `ops-test-org-${suffix}`,
      cashfreeVendorId: `ops_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
      bankAccountHolderName: 'Ops Test Owner',
      bankAccountNumberLast4: '1234',
      bankIfsc: 'HDFC0001234',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `ops-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const emptyOrg = await Organizer.create({ name: `Empty Ops Org ${suffix}`, slug: `empty-ops-org-${suffix}` });
    const emptyUser = await User.create({
      organizerId: emptyOrg.id,
      email: `empty-ops-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    emptyOrgToken = signAccessToken({ sub: emptyUser.id, role: emptyUser.role, organizerId: emptyOrg.id });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Ops Test Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    eventId = eventRes.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;

    const paidRes = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Ops Paid Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: `ops-paid-${suffix}@example.com`,
      paymentMethod: 'cash',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: paidRes.body.bookingId } });
    await Payment.update({ status: 'paid' }, { where: { bookingId: paidRes.body.bookingId } });
    const paidTicket = await Ticket.findOne({ where: { bookingId: paidRes.body.bookingId } });
    await request(app).post(`/api/organizer/events/${eventId}/checkin`).set('Authorization', `Bearer ${token}`).send({ qrToken: paidTicket!.qrToken });
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
    process.env.PLATFORM_FEE_PERCENT = originalFeePercent;
    await sequelize.close();
  });

  describe('GET /organizer/tickets', () => {
    it('returns real tickets with real attendee/booking/event data, not mock data', async () => {
      const res = await request(app).get('/api/organizer/tickets').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.tickets.length).toBeGreaterThanOrEqual(1);

      const row = res.body.tickets.find((t: { attendeeName: string }) => t.attendeeName === 'Ops Paid Customer');
      expect(row).toBeTruthy();
      expect(row.eventName).toBe(`Ops Test Event ${suffix}`);
      expect(row.customerEmail).toBe(`ops-paid-${suffix}@example.com`);
      expect(row.status).toBe('checked_in');
      expect(row.checkedInAt).not.toBeNull();
    });

    it('real counts reflect actual ticket statuses', async () => {
      const res = await request(app).get('/api/organizer/tickets').set('Authorization', `Bearer ${token}`);
      expect(res.body.counts.checked_in).toBeGreaterThanOrEqual(1);
      expect(res.body.counts.all).toBe(res.body.counts.valid + res.body.counts.checked_in + res.body.counts.cancelled);
    });

    it('filters by status correctly', async () => {
      const res = await request(app).get('/api/organizer/tickets?status=checked_in').set('Authorization', `Bearer ${token}`);
      expect(res.body.tickets.every((t: { status: string }) => t.status === 'checked_in')).toBe(true);
    });

    it('an organizer with no events gets an empty result, not an error', async () => {
      const res = await request(app).get('/api/organizer/tickets').set('Authorization', `Bearer ${emptyOrgToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tickets).toEqual([]);
      expect(res.body.counts).toEqual({ all: 0, valid: 0, checked_in: 0, cancelled: 0 });
    });
  });

  describe('GET /organizer/payments', () => {
    it('returns real revenue computed from actual paid Payment rows, and the real linked bank account', async () => {
      const res = await request(app).get('/api/organizer/payments').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.summary.totalRevenuePaise).toBeGreaterThanOrEqual(50000);
      expect(res.body.bankAccountHolderName).toBe('Ops Test Owner');
      expect(res.body.bankAccountNumberLast4).toBe('1234');
      expect(res.body.payoutActive).toBe(true);
    });

    it('includes a real transaction row for the actual paid booking, with correct customer and event names', async () => {
      const res = await request(app).get('/api/organizer/payments').set('Authorization', `Bearer ${token}`);
      const txn = res.body.transactions.find((t: { customerName: string }) => t.customerName === 'Ops Paid Customer');
      expect(txn).toBeTruthy();
      expect(txn.eventName).toBe(`Ops Test Event ${suffix}`);
      expect(txn.amountPaise).toBe(50000);
      expect(txn.status).toBe('paid');
    });

    it('an organizer with no events/payments gets a real zeroed summary, not an error', async () => {
      const res = await request(app).get('/api/organizer/payments').set('Authorization', `Bearer ${emptyOrgToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary.totalRevenuePaise).toBe(0);
      expect(res.body.transactions).toEqual([]);
      expect(res.body.bankAccountNumberLast4).toBeNull();
    });
  });
});
