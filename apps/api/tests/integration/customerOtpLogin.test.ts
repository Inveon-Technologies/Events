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

// Setup bookings trigger the designed confirmation email (banner, QR
// codes, invoice PDF) in the background; not what this suite checks.
jest.mock('../../src/services/bookingEmails', () => {
  const actual = jest.requireActual('../../src/services/bookingEmails');
  return { ...actual, deliverBookingConfirmationEmail: jest.fn().mockResolvedValue(undefined) };
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

  beforeEach(async () => {
    mockSendEmail.mockClear();
    // Each test requests fresh codes; the 30s resend cooldown has its
    // own test below.
    await redis.del(`otp-cooldown:customer_login:${customerEmail}`);
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

  it('initiate says clearly when the Booking ID does not exist, and sends nothing', async () => {
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: 'INV-BKG-2026-NOPE00', contact: customerEmail });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    expect(res.body.error).toMatch(/couldn't find a booking/);
    expect(mockSendEmail.mock.calls.filter((c) => c[0].subject.includes('login code'))).toHaveLength(0);
  });

  it('initiate says clearly when the email or phone does not match the booking', async () => {
    const wrongEmail = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: 'someone-else@example.com' });
    expect(wrongEmail.status).toBe(404);
    expect(wrongEmail.body.code).toBe('CONTACT_MISMATCH');
    expect(wrongEmail.body.error).toMatch(/email address doesn't match/);

    const wrongPhone = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: '9999999999' });
    expect(wrongPhone.status).toBe(404);
    expect(wrongPhone.body.error).toMatch(/mobile number doesn't match/);
    expect(mockSendEmail.mock.calls.filter((c) => c[0].subject.includes('login code'))).toHaveLength(0);
  });

  it('initiate rejects badly formatted input with a 400 and a field-level message', async () => {
    const badEmail = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: 'not-an-email@' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error).toMatch(/valid email/);

    const badPhone = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: '12345' });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.error).toMatch(/10-digit mobile/);

    const badRef = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: '??', contact: customerEmail });
    expect(badRef.status).toBe(400);

    const missing = await request(app).post('/api/bookings/login/initiate').send({});
    expect(missing.status).toBe(400);
  });

  it('logs in with the mobile number and a lower-case Booking ID, and the code is verified with the Booking ID alone', async () => {
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA.toLowerCase(), contact: '+91 90000 00001' });
    expect(res.status).toBe(200);
    // The code always goes to the booking's email; the response only
    // shows a masked version of it.
    expect(res.body.sentTo).toMatch(/^o\*+.@example\.com$/);
    expect(res.body.expiresInMinutes).toBe(10);

    const code = extractOtpFromEmail();
    const verifyRes = await request(app).post('/api/bookings/login/verify').send({ bookingReference: bookingRefA.toLowerCase(), code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.email).toBe(customerEmail);
    const my = await request(app).get('/api/bookings/my').set('Authorization', `Bearer ${verifyRes.body.token}`);
    expect(my.body.bookings).toHaveLength(2);
  });

  it('accepts the Ticket ID printed on the ticket in place of the Booking ID', async () => {
    const ticketId = `${bookingRefA.replace('-BKG-', '-TKT-')}-01`;
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: ticketId, contact: customerEmail });
    expect(res.status).toBe(200);
  });

  it('asks the customer to wait before resending a code within 30 seconds', async () => {
    const first = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: customerEmail });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: customerEmail });
    expect(second.status).toBe(429);
    expect(second.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(second.body.error).toMatch(/Please wait/);
  });

  it('reports a failed code email instead of pretending it was sent, and lets the customer retry at once', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP down'));
    const res = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: customerEmail });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/couldn't send/);
    const retry = await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: customerEmail });
    expect(retry.status).toBe(200);
  });

  it('verify explains a wrong code with the attempts left, and an expired one', async () => {
    await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, contact: customerEmail });
    const code = extractOtpFromEmail();
    const wrong = await request(app).post('/api/bookings/login/verify').send({ bookingReference: bookingRefA, code: code === '000000' ? '000001' : '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toMatch(/incorrect\. 4 attempts left/);

    await redis.del(`otp:customer_login:${customerEmail}`);
    const expired = await request(app).post('/api/bookings/login/verify').send({ bookingReference: bookingRefA, code });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toMatch(/expired/);

    const malformed = await request(app).post('/api/bookings/login/verify').send({ bookingReference: bookingRefA, code: '12ab' });
    expect(malformed.status).toBe(400);
  });

  it('the ticket lookup also accepts the mobile number and any Booking ID casing', async () => {
    const res = await request(app).get(`/api/bookings/${bookingRefA.toLowerCase()}/tickets`).query({ email: '9000000001' });
    expect(res.status).toBe(200);
    expect(res.body.bookingReference).toBe(bookingRefA);
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
    expect(myBookingsRes.body.bookings[0].ticketPagePath).toMatch(/^\/t\/INV-BKG-/);
  });

  it('lists older bookings stored with different email casing (before emails were normalized)', async () => {
    await Booking.update({ primaryContactEmail: customerEmail.toUpperCase() }, { where: { bookingReference: bookingRefA } });
    try {
      mockSendEmail.mockClear();
      await request(app).post('/api/bookings/login/initiate').send({ bookingReference: bookingRefA, email: customerEmail });
      // Sent to the address as stored on the booking.
      const code = mockSendEmail.mock.calls[0][0].html.match(/(\d{6})/)![1];
      const verifyRes = await request(app).post('/api/bookings/login/verify').send({ email: customerEmail, code });
      const myBookingsRes = await request(app).get('/api/bookings/my').set('Authorization', `Bearer ${verifyRes.body.token}`);
      expect(myBookingsRes.body.bookings).toHaveLength(2);
    } finally {
      await Booking.update({ primaryContactEmail: customerEmail }, { where: { bookingReference: bookingRefA } });
    }
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
