import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { cashfreeCreateRefund, cashfreeCreateOrder } from '../../src/services/cashfreeClient';

jest.mock('../../src/services/cashfreeClient', () => {
  const actual = jest.requireActual('../../src/services/cashfreeClient');
  return { ...actual, cashfreeCreateRefund: jest.fn(), cashfreeCreateOrder: jest.fn() };
});

const mockCreateRefund = cashfreeCreateRefund as jest.MockedFunction<typeof cashfreeCreateRefund>;
const mockCreateOrder = cashfreeCreateOrder as jest.MockedFunction<typeof cashfreeCreateOrder>;

describe('cancellation + refund system (real DB, Cashfree refund API mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    process.env.API_PUBLIC_URL = 'https://events.test.example';
    mockCreateOrder.mockImplementation(async (params) => ({
      cf_order_id: `cf_${Math.random().toString(36).slice(2)}`,
      order_id: params.orderId,
      order_status: 'ACTIVE',
      payment_session_id: `session_${Math.random().toString(36).slice(2)}`,
      order_expiry_time: '2026-12-31T00:00:00+05:30',
    }));

    const organizer = await Organizer.create({
      name: `Cancellation Test Org ${suffix}`,
      slug: `cancellation-test-org-${suffix}`,
      cashfreeVendorId: `cancellation_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `cancellation-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({
      name: `Other Cancellation Org ${suffix}`,
      slug: `other-cancellation-org-${suffix}`,
    });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: `other-cancellation-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });
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
        title: `Cancellation Test Event ${suffix}-${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
        ...overrides,
      });
    const tierId = (await TicketCategory.findOne({ where: { eventId: res.body.id } }))!.id;
    return { eventId: res.body.id as string, tierId };
  }

  async function createConfirmedOnlineBooking(eventId: string, tierId: string, email: string, orderId: string) {
    mockCreateRefund.mockClear();
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Cancellation Test Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'online',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
    await Payment.update({ status: 'paid', gatewayReference: orderId }, { where: { bookingId: res.body.bookingId } });
    return res.body as { bookingId: string; bookingReference: string };
  }

  describe('customer self-service cancellation', () => {
    it('is rejected when the event has self-service cancellation disabled (the default)', async () => {
      const { eventId, tierId } = await createEvent();
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `self-off-${suffix}@example.com`, `order-off-${suffix}`);

      const res = await request(app)
        .post(`/api/bookings/${booking.bookingReference}/cancel`)
        .send({ email: `self-off-${suffix}@example.com`, reason: 'Change of plans' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not available/i);
      expect(mockCreateRefund).not.toHaveBeenCalled();
    });

    it('succeeds and triggers a real Cashfree refund when enabled, within cutoff, with the configured refund percentage', async () => {
      const { eventId, tierId } = await createEvent({
        allowSelfServiceCancellation: true,
        refundCutoffDays: 3,
        refundPercentage: 80,
      });
      const orderId = `order-ok-${suffix}`;
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `self-ok-${suffix}@example.com`, orderId);

      mockCreateRefund.mockResolvedValue({
        cf_refund_id: 'cf_1', refund_id: `${booking.bookingReference}-refund`, order_id: orderId,
        refund_amount: 400, refund_status: 'SUCCESS',
      });

      const res = await request(app)
        .post(`/api/bookings/${booking.bookingReference}/cancel`)
        .send({ email: `self-ok-${suffix}@example.com`, reason: 'Change of plans' });
      expect(res.status).toBe(200);
      expect(res.body.refundAmountPaise).toBe(40000); // 80% of ₹500
      expect(res.body.refundStatus).toBe('SUCCESS');

      expect(mockCreateRefund).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateRefund.mock.calls[0][0];
      expect(callArgs.orderId).toBe(orderId);
      expect(callArgs.refundAmountRupees).toBe(400);

      const dbBooking = await Booking.findByPk(booking.bookingId);
      expect(dbBooking!.status).toBe('cancelled');
      expect(dbBooking!.cancelledBy).toBe('customer');

      const tickets = await Ticket.findAll({ where: { bookingId: booking.bookingId } });
      expect(tickets.every((t) => t.status === 'cancelled')).toBe(true);

      const payment = await Payment.findOne({ where: { bookingId: booking.bookingId } });
      expect(payment!.status).toBe('refunded');
    });

    it('releases the ticket quota back after cancellation', async () => {
      const { eventId, tierId } = await createEvent({ allowSelfServiceCancellation: true, refundCutoffDays: 3, refundPercentage: 100 });
      const before = await TicketCategory.findByPk(tierId);
      const quotaBefore = before!.quotaRemaining;

      const orderId = `order-quota-${suffix}`;
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `quota-${suffix}@example.com`, orderId);
      mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: orderId, refund_amount: 500, refund_status: 'SUCCESS' });

      const afterBooking = await TicketCategory.findByPk(tierId);
      expect(afterBooking!.quotaRemaining).toBe(quotaBefore - 1);

      await request(app).post(`/api/bookings/${booking.bookingReference}/cancel`).send({ email: `quota-${suffix}@example.com`, reason: 'x' });

      const afterCancel = await TicketCategory.findByPk(tierId);
      expect(afterCancel!.quotaRemaining).toBe(quotaBefore);
    });

    it('is rejected past the refund cutoff window', async () => {
      const { eventId, tierId } = await createEvent({ allowSelfServiceCancellation: true, refundCutoffDays: 3, refundPercentage: 100 });
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `cutoff-${suffix}@example.com`, `order-cutoff-${suffix}`);
      // Moved into the past only after booking — bookings on a started
      // event are refused outright.
      await Event.update({ eventDate: new Date('2020-01-01') }, { where: { id: eventId } });
      const res = await request(app)
        .post(`/api/bookings/${booking.bookingReference}/cancel`)
        .send({ email: `cutoff-${suffix}@example.com`, reason: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cancellation window/i);
      expect(mockCreateRefund).not.toHaveBeenCalled();
    });

    it('rejects a wrong email with the same 404 as a nonexistent booking', async () => {
      const { eventId, tierId } = await createEvent({ allowSelfServiceCancellation: true, refundCutoffDays: 3, refundPercentage: 100 });
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `wrongemail-${suffix}@example.com`, `order-we-${suffix}`);

      const wrongEmail = await request(app).post(`/api/bookings/${booking.bookingReference}/cancel`).send({ email: 'nope@example.com', reason: 'x' });
      const nonexistent = await request(app).post('/api/bookings/DOES-NOT-EXIST/cancel').send({ email: 'nope@example.com', reason: 'x' });
      expect(wrongEmail.status).toBe(404);
      expect(nonexistent.status).toBe(404);
      expect(wrongEmail.body.error).toBe(nonexistent.body.error);
    });
  });

  describe('organizer-initiated booking cancellation', () => {
    it('always refunds in full, regardless of the event\'s self-service refund percentage policy', async () => {
      const { eventId, tierId } = await createEvent({ allowSelfServiceCancellation: true, refundCutoffDays: 3, refundPercentage: 20 });
      const orderId = `order-org-${suffix}`;
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `org-cancel-${suffix}@example.com`, orderId);
      mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: orderId, refund_amount: 500, refund_status: 'SUCCESS' });

      const res = await request(app)
        .post(`/api/organizer/bookings/${booking.bookingId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Weather cancellation' });
      expect(res.status).toBe(200);
      expect(res.body.refundAmountPaise).toBe(50000); // 100%, not the 20% policy

      const callArgs = mockCreateRefund.mock.calls[0][0];
      expect(callArgs.refundAmountRupees).toBe(500);
    });

    it('refuses to cancel another organizer\'s booking', async () => {
      const { eventId, tierId } = await createEvent();
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `forbidden-${suffix}@example.com`, `order-forbidden-${suffix}`);
      const res = await request(app)
        .post(`/api/organizer/bookings/${booking.bookingId}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ reason: 'x' });
      expect(res.status).toBe(403);
    });

    it('requires a reason', async () => {
      const { eventId, tierId } = await createEvent();
      const booking = await createConfirmedOnlineBooking(eventId, tierId, `noreason-${suffix}@example.com`, `order-noreason-${suffix}`);
      const res = await request(app)
        .post(`/api/organizer/bookings/${booking.bookingId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('organizer-initiated event cancellation', () => {
    it('cancels the event and cascades a full refund to every confirmed booking', async () => {
      const { eventId, tierId } = await createEvent();
      const orderIdA = `order-cascade-a-${suffix}`;
      const orderIdB = `order-cascade-b-${suffix}`;
      const bookingA = await createConfirmedOnlineBooking(eventId, tierId, `cascade-a-${suffix}@example.com`, orderIdA);
      const bookingB = await createConfirmedOnlineBooking(eventId, tierId, `cascade-b-${suffix}@example.com`, orderIdB);

      mockCreateRefund.mockResolvedValue({ cf_refund_id: 'cf', refund_id: 'r', order_id: 'x', refund_amount: 500, refund_status: 'SUCCESS' });

      const res = await request(app)
        .post(`/api/organizer/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Venue unavailable' });
      expect(res.status).toBe(200);
      expect(res.body.cancelledBookings).toHaveLength(2);

      const event = await Event.findByPk(eventId);
      expect(event!.status).toBe('cancelled');
      expect(event!.cancellationReason).toBe('Venue unavailable');

      const dbBookingA = await Booking.findByPk(bookingA.bookingId);
      const dbBookingB = await Booking.findByPk(bookingB.bookingId);
      expect(dbBookingA!.status).toBe('cancelled');
      expect(dbBookingB!.status).toBe('cancelled');
      expect(dbBookingA!.refundAmountPaise).toBe(50000);
      expect(dbBookingB!.refundAmountPaise).toBe(50000);

      expect(mockCreateRefund).toHaveBeenCalledTimes(2);
    });

    it('refuses to cancel an already-cancelled event', async () => {
      const { eventId } = await createEvent();
      await Event.update({ status: 'cancelled' }, { where: { id: eventId } });
      const res = await request(app)
        .post(`/api/organizer/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already cancelled/i);
    });

    it('refuses to cancel another organizer\'s event', async () => {
      const { eventId } = await createEvent();
      const res = await request(app)
        .post(`/api/organizer/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ reason: 'x' });
      expect(res.status).toBe(403);
    });
  });
});
