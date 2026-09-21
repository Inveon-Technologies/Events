import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('event financials: GET /organizer/events/:eventId/financials (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let otherToken: string;
  let eventId: string;
  let tierId: string;

  const originalFeePercent = process.env.PLATFORM_FEE_PERCENT;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Financials Test Org ${suffix}`,
      slug: `financials-test-org-${suffix}`,
      cashfreeVendorId: `financials_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
      bankAccountHolderName: 'Real Financials Owner',
      bankAccountNumberLast4: '4912',
      bankIfsc: 'HDFC0000123',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `financials-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({
      name: `Other Financials Org ${suffix}`,
      slug: `other-financials-org-${suffix}`,
    });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: `other-financials-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Financials Test Event ${suffix}`,
        startDate: '2026-12-15',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    eventId = eventRes.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;

    // Two paid bookings (₹500 each = ₹1000 gross) and one cash booking
    // (unpaid via Cashfree, should not count toward gross revenue).
    for (let i = 0; i < 2; i += 1) {
      const bookingRes = await request(app).post(`/api/events/${eventId}/bookings`).send({
        ticketCategoryId: tierId,
        quantity: 1,
        primaryContactName: `Paid Customer ${i}`,
        primaryContactWhatsapp: '+919000000001',
        primaryContactEmail: `financials-paid-${i}-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
      // eslint-disable-next-line no-await-in-loop
      await Booking.update({ status: 'confirmed' }, { where: { id: bookingRes.body.bookingId } });
      // eslint-disable-next-line no-await-in-loop
      await Payment.update({ status: 'paid' }, { where: { bookingId: bookingRes.body.bookingId } });
    }
  });

  afterAll(async () => {
    const bookings = await Booking.findAll({ where: { eventId } });
    for (const booking of bookings) {
      await Payment.destroy({ where: { bookingId: booking.id } });
      await Ticket.destroy({ where: { bookingId: booking.id } });
    }
    await Booking.destroy({ where: { eventId } });
    await TicketCategory.destroy({ where: { eventId } });
    await Event.destroy({ where: { id: eventId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    process.env.PLATFORM_FEE_PERCENT = originalFeePercent;
    await sequelize.close();
  });

  it('computes real gross revenue from actually-paid bookings only, and reflects PLATFORM_FEE_PERCENT=0 correctly', async () => {
    process.env.PLATFORM_FEE_PERCENT = '0';
    const res = await request(app).get(`/api/organizer/events/${eventId}/financials`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.grossRevenuePaise).toBe(100000); // 2 x ₹500 in paise
    expect(res.body.platformFeePercent).toBe(0);
    expect(res.body.platformFeePaise).toBe(0);
    expect(res.body.netPayoutPaise).toBe(100000); // 100% to organizer at 0% fee
  });

  it('reflects a non-zero PLATFORM_FEE_PERCENT correctly, not a hardcoded percentage', async () => {
    process.env.PLATFORM_FEE_PERCENT = '10';
    const res = await request(app).get(`/api/organizer/events/${eventId}/financials`).set('Authorization', `Bearer ${token}`);
    expect(res.body.platformFeePercent).toBe(10);
    expect(res.body.platformFeePaise).toBe(10000); // 10% of ₹1000
    expect(res.body.netPayoutPaise).toBe(90000);
  });

  it('returns the organizer\'s real linked bank details, not a placeholder account', async () => {
    const res = await request(app).get(`/api/organizer/events/${eventId}/financials`).set('Authorization', `Bearer ${token}`);
    expect(res.body.bankAccountHolderName).toBe('Real Financials Owner');
    expect(res.body.bankAccountNumberLast4).toBe('4912');
    expect(res.body.bankIfsc).toBe('HDFC0000123');
    expect(res.body.payoutActive).toBe(true);
  });

  it('refuses to show another organizer\'s event financials', async () => {
    const res = await request(app).get(`/api/organizer/events/${eventId}/financials`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('404s cleanly for a nonexistent event', async () => {
    const res = await request(app)
      .get('/api/organizer/events/00000000-0000-0000-0000-000000000000/financials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
