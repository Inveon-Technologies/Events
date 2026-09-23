import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { connectRedis, redis } from '../../src/db/redis';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

describe('real customer OTP login (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let organizerToken: string;
  let eventAId: string;
  let eventBId: string;
  let tierAId: string;
  let tierBId: string;
  const customerEmail = `otp-login-${suffix}@example.com`;
  let bookingRefA: string;

  beforeAll(async () => {
    await connectRedis();
    mockIsEmailConfigured.mockReturnValue(true);
    const organizer = await Organizer.create({
      name: `OTP Login Test Org ${suffix}`,
      slug: `otp-login-test-org-${suffix}`,
      cashfreeVendorId: `otp_login_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `otp-login-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    organizerToken = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const eventARes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ title: `OTP Login Event A ${suffix}`, startDate: '2026-12-25', startTime: '09:00', ticketTiers: [{ name: 'General', price: 500, quantity: 20 }], status: 'published' });
    eventAId = eventARes.body.id;
    tierAId = (await TicketCategory.findOne({ where: { eventId: eventAId } }))!.id;

    const eventBRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ title: `OTP Login Event B ${suffix}`, startDate: '2026-12-26', startTime: '09:00', ticketTiers: [{ name: 'VIP', price: 1000, quantity: 20 }], status: 'published' });
    eventBId = eventBRes.body.id;
    tierBId = (await TicketCategory.findOne({ where: { eventId: eventBId } }))!.id;

    const bookingA = await request(app).post(`/api/events/${eventAId}/bookings`).send({
      ticketCategoryId: tierAId, quantity: 1, primaryContactName: 'OTP Login Customer',
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: customerEmail, paymentMethod: 'cash',
    });
    bookingRefA = bookingA.body.bookingReference;
    await request(app).post(`/api/events/${eventBId}/bookings`).send({
      ticketCategoryId: tierBId, quantity: 2, primaryContactName: 'OTP Login Customer',
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: customerEmail, paymentMethod: 'cash',
    });
  });

  beforeEach(() => {
    mockSendEmail.mockClear();
  });

  afterAll(async () => {
    for (const eventId of [eventAId, eventBId]) {
      const bookings = await Booking.findAll({ where: { eventId } });
      for (const booking of bookings) {
        await Payment.destroy({ where: { bookingId: booking.id } });
        await Ticket.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId } });
      await TicketCategory.destroy({ where: { eventId } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await redis.quit();
    await sequelize.close();
  });

  function extractOtpFromEmail(): string {
    const call = mockSendEmail.mock.calls.find((c) => c[0].to === customerEmail);
    const match = call![0].html.match(/(\d{6})/);
    return match![1];
  }

  it('initiate sends a real OTP email when the booking reference and email genuinely match', async () => {
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, email: customerEmail });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Filtered by real recipient and real OTP content, not a blanket
    // call count — booking confirmation emails from this suite's own
    // setup are deliberately fire-and-forget (see publicBookings.ts's
    // `void sendBookingConfirmationEmail(...)`) and can still land
    // asynchronously around here, unrelated to this assertion.
    const otpCalls = mockSendEmail.mock.calls.filter((c) => c[0].to === customerEmail && c[0].subject.includes('login code'));
    expect(otpCalls).toHaveLength(1);
  });

  it('initiate returns the identical success response for a wrong combo, but never actually sends an email — real enumeration safety', async () => {
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: 'DOES-NOT-EXIST', email: customerEmail });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('verify rejects a wrong OTP code', async () => {
    await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, email: customerEmail });
    const res = await request(app).post('/api/bookings/login/verify').send({ email: customerEmail, code: '000000' });
    expect(res.status).toBe(401);
  });

  it('verify with the real emailed code succeeds and returns a real session token, then lists every real booking for that email across both events', async () => {
    await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, email: customerEmail });
    const realCode = extractOtpFromEmail();

    const verifyRes = await request(app).post('/api/bookings/login/verify').send({ email: customerEmail, code: realCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeTruthy();

    const myBookingsRes = await request(app).get('/api/bookings/my').set('Authorization', `Bearer ${verifyRes.body.token}`);
    expect(myBookingsRes.status).toBe(200);
    expect(myBookingsRes.body.bookings).toHaveLength(2);
    const eventNames = myBookingsRes.body.bookings.map((b: { eventName: string }) => b.eventName).sort();
    expect(eventNames).toEqual([`OTP Login Event A ${suffix}`, `OTP Login Event B ${suffix}`].sort());
  });

  it('the same OTP code cannot be used twice — real single-use enforcement', async () => {
    await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, email: customerEmail });
    const realCode = extractOtpFromEmail();

    const first = await request(app).post('/api/bookings/login/verify').send({ email: customerEmail, code: realCode });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/bookings/login/verify').send({ email: customerEmail, code: realCode });
    expect(second.status).toBe(401);
  });

  it('/bookings/my rejects a request with no token, and with a garbage token', async () => {
    const noToken = await request(app).get('/api/bookings/my');
    expect(noToken.status).toBe(401);

    const badToken = await request(app).get('/api/bookings/my').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('a real organizer access token is rejected by the customer-only /bookings/my endpoint', async () => {
    const res = await request(app).get('/api/bookings/my').set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(401);
  });
});
