import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { cashfreeCreateRefund, cashfreeCreateOrder } from '../../src/services/cashfreeClient';
import { sendEmail, isEmailConfigured } from '../../src/services/email';

jest.mock('../../src/services/cashfreeClient', () => {
  const actual = jest.requireActual('../../src/services/cashfreeClient');
  return { ...actual, cashfreeCreateRefund: jest.fn(), cashfreeCreateOrder: jest.fn() };
});
jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn() };
});

const mockCreateRefund = cashfreeCreateRefund as jest.MockedFunction<typeof cashfreeCreateRefund>;
const mockCreateOrder = cashfreeCreateOrder as jest.MockedFunction<typeof cashfreeCreateOrder>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

describe('real cancellation emails (real DB, Cashfree + email mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let ownerEmail: string;

  beforeAll(async () => {
    process.env.API_PUBLIC_URL = 'https://events.test.example';
    mockIsEmailConfigured.mockReturnValue(true);
    mockCreateOrder.mockImplementation(async (params) => ({
      cf_order_id: `cf_${Math.random().toString(36).slice(2)}`,
      order_id: params.orderId,
      order_status: 'ACTIVE',
      payment_session_id: `session_${Math.random().toString(36).slice(2)}`,
      order_expiry_time: '2026-12-31T00:00:00+05:30',
    }));

    const organizer = await Organizer.create({
      name: `Cancel Email Test Org ${suffix}`,
      slug: `cancel-email-test-org-${suffix}`,
      cashfreeVendorId: `cancel_email_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    ownerEmail = `cancel-email-owner-${suffix}@example.com`;
    const user = await User.create({
      organizerId,
      email: ownerEmail,
      name: 'Cancel Email Owner',
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  beforeEach(() => {
    mockSendEmail.mockClear();
    mockCreateRefund.mockClear();
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    for (const event of events) {
      const bookings = await Booking.findAll({ where: { eventId: event.id } });
      for (const booking of bookings) {
        await Payment.destroy({ where: { bookingId: booking.id } });
        await Ticket.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId: event.id } });
      await TicketCategory.destroy({ where: { eventId: event.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  async function createEvent(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Cancel Email Test Event ${suffix}-${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
        ...overrides,
      });
    const tierId = (await TicketCategory.findOne({ where: { eventId: res.body.id } }))!.id;
    return { eventId: res.body.id as string, tierId };
  }

  async function createConfirmedBooking(eventId: string, tierId: string, email: string, orderId: string) {
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Cancel Email Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'online',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
    await Payment.update({ status: 'paid', gatewayReference: orderId }, { where: { bookingId: res.body.bookingId } });
    return res.body as { bookingId: string; bookingReference: string };
  }

  it('a full-refund organizer cancellation emails the customer with the real refund amount, no "No Refund" notice', async () => {
    const { eventId, tierId } = await createEvent();
    const orderId = `order-refund-email-${suffix}`;
    const booking = await createConfirmedBooking(eventId, tierId, `refund-email-${suffix}@example.com`, orderId);
    mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: orderId, refund_amount: 500, refund_status: 'SUCCESS' });

    await request(app)
      .post(`/api/organizer/bookings/${booking.bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Testing refund email' });

    const call = mockSendEmail.mock.calls.find((c) => c[0].to === `refund-email-${suffix}@example.com`);
    expect(call).toBeTruthy();
    expect(call![0].subject).toContain('Booking cancelled');
    expect(call![0].html).toContain('₹500');
    expect(call![0].html).not.toContain('No Refund');
    expect(call![0].html).toContain('cancelled by the organizer');
  });

  it('a no-refund cancellation clearly shows "No Refund" in the customer email, not a hidden ₹0', async () => {
    const { eventId, tierId } = await createEvent({ allowSelfServiceCancellation: true, refundCutoffDays: 3, refundPercentage: 0 });
    const orderId = `order-norefund-email-${suffix}`;
    const booking = await createConfirmedBooking(eventId, tierId, `norefund-email-${suffix}@example.com`, orderId);

    await request(app)
      .post(`/api/bookings/${booking.bookingReference}/cancel`)
      .send({ email: `norefund-email-${suffix}@example.com`, reason: 'Changed my mind' });

    const call = mockSendEmail.mock.calls.find((c) => c[0].to === `norefund-email-${suffix}@example.com`);
    expect(call).toBeTruthy();
    expect(call![0].html).toContain('No Refund');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('an event cancellation emails every affected customer with event-level messaging, and the organizer with a real summary', async () => {
    const { eventId, tierId } = await createEvent();
    const orderIdA = `order-event-cancel-a-${suffix}`;
    const orderIdB = `order-event-cancel-b-${suffix}`;
    await createConfirmedBooking(eventId, tierId, `event-cancel-a-${suffix}@example.com`, orderIdA);
    await createConfirmedBooking(eventId, tierId, `event-cancel-b-${suffix}@example.com`, orderIdB);
    mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: 'x', refund_amount: 500, refund_status: 'SUCCESS' });

    await request(app)
      .post(`/api/organizer/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Venue flooded' });

    const customerCallA = mockSendEmail.mock.calls.find((c) => c[0].to === `event-cancel-a-${suffix}@example.com`);
    const customerCallB = mockSendEmail.mock.calls.find((c) => c[0].to === `event-cancel-b-${suffix}@example.com`);
    expect(customerCallA).toBeTruthy();
    expect(customerCallB).toBeTruthy();
    expect(customerCallA![0].html).toContain('This event has been cancelled');

    const organizerCall = mockSendEmail.mock.calls.find((c) => c[0].to === ownerEmail);
    expect(organizerCall).toBeTruthy();
    expect(organizerCall![0].html).toContain('2'); // 2 bookings cancelled
    expect(organizerCall![0].html).toContain('₹1,000'); // total refunded
    expect(organizerCall![0].subject).toContain('2 booking(s) refunded');
  });

  it('never sends any cancellation email when email is not configured, and never throws', async () => {
    mockIsEmailConfigured.mockReturnValueOnce(false);
    const { eventId, tierId } = await createEvent();
    const orderId = `order-noemail-${suffix}`;
    const booking = await createConfirmedBooking(eventId, tierId, `noemail-${suffix}@example.com`, orderId);
    mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: orderId, refund_amount: 500, refund_status: 'SUCCESS' });

    const res = await request(app)
      .post(`/api/organizer/bookings/${booking.bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Testing no-email path' });

    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
