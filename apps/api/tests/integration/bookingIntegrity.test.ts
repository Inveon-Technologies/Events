import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import {
  cashfreeCreateOrder,
  cashfreeCreateRefund,
  cashfreeGetOrder,
  cashfreeGetOrderPayments,
  CashfreeApiError,
} from '../../src/services/cashfreeClient';
import { expireStalePendingOnlineBookings, releaseCustomersOwnHolds, SEAT_HOLD_MS } from '../../src/services/pendingBookingExpiry';
import { generateBookingReference } from '../../src/services/bookingCreation';

jest.mock('../../src/services/cashfreeClient', () => {
  const actual = jest.requireActual('../../src/services/cashfreeClient');
  return {
    ...actual,
    cashfreeCreateOrder: jest.fn(),
    cashfreeCreateRefund: jest.fn(),
    cashfreeGetOrder: jest.fn(),
    cashfreeGetOrderPayments: jest.fn().mockResolvedValue([]),
  };
});

const mockCreateOrder = cashfreeCreateOrder as jest.MockedFunction<typeof cashfreeCreateOrder>;
const mockCreateRefund = cashfreeCreateRefund as jest.MockedFunction<typeof cashfreeCreateRefund>;
const mockGetOrder = cashfreeGetOrder as jest.MockedFunction<typeof cashfreeGetOrder>;
const mockGetOrderPayments = cashfreeGetOrderPayments as jest.MockedFunction<typeof cashfreeGetOrderPayments>;

const WEBHOOK_SECRET = 'test-webhook-secret-integrity';

// Covers the booking-lifecycle fixes: input validation at booking
// time, race-safe state transitions (webhooks, cancellation, check-in),
// late payments, and the stale-pending-booking sweep.
describe('booking integrity (real DB, Cashfree API mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let ownerToken: string;
  let staffToken: string;
  let volunteerToken: string;

  function signedWebhook(payload: unknown) {
    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(timestamp + rawBody)
      .digest('base64');
    return request(app)
      .post('/api/webhooks/cashfree')
      .set('Content-Type', 'application/json')
      .set('x-webhook-timestamp', timestamp)
      .set('x-webhook-signature', signature)
      .send(rawBody);
  }

  async function createEvent(
    opts: { quota?: number; price?: number; status?: 'draft' | 'published' | 'cancelled'; daysAhead?: number; maxPerBooking?: number } = {},
  ) {
    const event = await Event.create({
      organizerId,
      name: `Integrity Event ${suffix}-${Math.random()}`,
      eventDate: new Date(Date.now() + (opts.daysAhead ?? 30) * 86400000),
      capacity: opts.quota ?? 10,
      status: opts.status ?? 'published',
    });
    const tier = await TicketCategory.create({
      eventId: event.id,
      name: 'General',
      pricePaise: opts.price ?? 50000,
      quotaTotal: opts.quota ?? 10,
      quotaRemaining: opts.quota ?? 10,
      ...(opts.maxPerBooking !== undefined ? { maxPerBooking: opts.maxPerBooking } : {}),
    });
    return { event, tier };
  }

  function bookingBody(tierId: string, overrides: Record<string, unknown> = {}) {
    return {
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Integrity Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: `integrity-${suffix}@example.com`,
      paymentMethod: 'online',
      ...overrides,
    };
  }

  let customerSeq = 0;
  async function createOnlineBooking(eventId: string, tierId: string, quantity = 1, email?: string) {
    customerSeq += 1;
    const primaryContactEmail = email ?? `integrity-${suffix}-${customerSeq}@example.com`;
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send(bookingBody(tierId, { quantity, primaryContactEmail }));
    expect(res.status).toBe(201);
    const payment = (await Payment.findOne({ where: { bookingId: res.body.bookingId } }))!;
    return { bookingId: res.body.bookingId as string, bookingReference: res.body.bookingReference as string, payment };
  }

  async function quotaRemaining(tierId: string) {
    return (await TicketCategory.findByPk(tierId))!.quotaRemaining;
  }

  beforeAll(async () => {
    process.env.CASHFREE_SECRET_KEY = WEBHOOK_SECRET;
    process.env.API_PUBLIC_URL = 'https://events.test.example';

    mockCreateOrder.mockImplementation(async (params) => ({
      cf_order_id: `cf_${Math.random().toString(36).slice(2)}`,
      order_id: params.orderId,
      order_status: 'ACTIVE',
      payment_session_id: `session_${Math.random().toString(36).slice(2)}`,
      order_expiry_time: new Date(Date.now() + 20 * 60000).toISOString(),
    }));

    const organizer = await Organizer.create({
      name: `Integrity Org ${suffix}`,
      slug: `integrity-org-${suffix}`,
      cashfreeVendorId: `integrity_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;

    const mkUser = async (role: 'organizer_owner' | 'organizer_staff' | 'gate_volunteer') => {
      const user = await User.create({
        organizerId,
        email: `integrity-${role}-${suffix}@example.com`,
        passwordHash: await hashPassword('TestPassword123'),
        role,
        emailVerified: true,
      });
      return signAccessToken({ sub: user.id, role, organizerId });
    };
    ownerToken = await mkUser('organizer_owner');
    staffToken = await mkUser('organizer_staff');
    volunteerToken = await mkUser('gate_volunteer');
  });

  beforeEach(() => {
    mockCreateRefund.mockReset();
    mockGetOrder.mockReset();
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    const eventIds = events.map((e) => e.id);
    const bookings = await Booking.findAll({ where: { eventId: eventIds } });
    const bookingIds = bookings.map((b) => b.id);
    await Payment.destroy({ where: { bookingId: bookingIds } });
    await Ticket.destroy({ where: { bookingId: bookingIds } });
    await Booking.destroy({ where: { id: bookingIds } });
    await TicketCategory.destroy({ where: { eventId: eventIds } });
    await Event.destroy({ where: { id: eventIds } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  describe('booking-time validation', () => {
    it('rejects a fractional quantity instead of issuing extra tickets for a partial price', async () => {
      const { event, tier } = await createEvent();
      const res = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { quantity: 1.4 }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/whole number/i);
      expect(await quotaRemaining(tier.id)).toBe(10);
      expect(await Booking.count({ where: { eventId: event.id } })).toBe(0);
    });

    it("enforces the tier's max_per_booking", async () => {
      const { event, tier } = await createEvent({ maxPerBooking: 2 });
      const res = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { quantity: 3 }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at most 2/);
      expect(await quotaRemaining(tier.id)).toBe(10);
    });

    it.each(['draft', 'cancelled'] as const)('refuses bookings on a %s event', async (status) => {
      const { event, tier } = await createEvent({ status });
      const res = await request(app).post(`/api/events/${event.id}/bookings`).send(bookingBody(tier.id));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not open for booking/i);
    });

    it('refuses bookings on an event that has already started', async () => {
      const { event, tier } = await createEvent({ daysAhead: -1 });
      const res = await request(app).post(`/api/events/${event.id}/bookings`).send(bookingBody(tier.id));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already started/i);
    });

    it('stores the contact email lowercased', async () => {
      const { event, tier } = await createEvent();
      const res = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { primaryContactEmail: `  Mixed.Case-${suffix}@Example.COM ` }));
      expect(res.status).toBe(201);
      const booking = await Booking.findByPk(res.body.bookingId);
      expect(booking!.primaryContactEmail).toBe(`mixed.case-${suffix}@example.com`);
    });

    it('only honors a return URL on this site, never an external one', async () => {
      const { event, tier } = await createEvent();
      mockCreateOrder.mockClear();
      await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { returnUrl: 'https://evil.example/phish' }));
      expect(mockCreateOrder.mock.calls[0][0].returnUrl).not.toContain('evil.example');
      expect(mockCreateOrder.mock.calls[0][0].returnUrl).toMatch(/\/bookings\/.+\/confirmed$/);
      expect(mockCreateOrder.mock.calls[0][0].expiresAt).toBeInstanceOf(Date);
    });
  });

  it('generates unguessable, unambiguous booking references', () => {
    const refs = new Set(Array.from({ length: 2000 }, () => generateBookingReference()));
    expect(refs.size).toBe(2000);
    for (const ref of refs) expect(ref).toMatch(/^INV-BKG-\d{4}-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  describe('payment webhooks', () => {
    it('releases tickets exactly once when duplicate failure webhooks arrive concurrently', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const { bookingReference } = await createOnlineBooking(event.id, tier.id, 2);
      expect(await quotaRemaining(tier.id)).toBe(3);

      const payload = { type: 'PAYMENT_FAILED_WEBHOOK', data: { order: { order_id: bookingReference } } };
      const responses = await Promise.all([signedWebhook(payload), signedWebhook(payload), signedWebhook(payload)]);
      responses.forEach((r) => expect(r.status).toBe(200));

      expect(await quotaRemaining(tier.id)).toBe(5);
    });

    it('does not confirm a booking when the paid amount does not match', async () => {
      const { event, tier } = await createEvent();
      const { bookingId, bookingReference } = await createOnlineBooking(event.id, tier.id);
      await signedWebhook({
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: { order: { order_id: bookingReference }, payment: { payment_amount: 1 } },
      });
      expect((await Booking.findByPk(bookingId))!.status).toBe('pending');
    });

    it('reinstates a booking when payment succeeds after a failure webhook, re-reserving its tickets', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const { bookingId, bookingReference, payment } = await createOnlineBooking(event.id, tier.id, 2);
      await signedWebhook({ type: 'PAYMENT_FAILED_WEBHOOK', data: { order: { order_id: bookingReference } } });
      expect((await Booking.findByPk(bookingId))!.status).toBe('cancelled');
      expect(await quotaRemaining(tier.id)).toBe(5);

      await signedWebhook({
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: { order: { order_id: bookingReference }, payment: { payment_amount: 1000 } },
      });

      expect((await Booking.findByPk(bookingId))!.status).toBe('confirmed');
      expect((await Payment.findByPk(payment.id))!.status).toBe('paid');
      expect(await quotaRemaining(tier.id)).toBe(3);
      const tickets = await Ticket.findAll({ where: { bookingId } });
      expect(tickets.every((t) => t.status === 'valid')).toBe(true);
      expect(mockCreateRefund).not.toHaveBeenCalled();
    });

    it('refunds in full when a late payment arrives but the tickets have sold out meanwhile', async () => {
      const { event, tier } = await createEvent({ quota: 1 });
      const late = await createOnlineBooking(event.id, tier.id);
      await signedWebhook({ type: 'PAYMENT_FAILED_WEBHOOK', data: { order: { order_id: late.bookingReference } } });
      // Someone else takes the released ticket.
      await createOnlineBooking(event.id, tier.id);
      expect(await quotaRemaining(tier.id)).toBe(0);

      mockCreateRefund.mockResolvedValue({ refund_status: 'SUCCESS' } as never);
      await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: late.bookingReference } } });

      const booking = (await Booking.findByPk(late.bookingId))!;
      expect(booking.status).toBe('cancelled');
      expect(booking.refundAmountPaise).toBe(50000);
      expect(booking.refundStatus).toBe('SUCCESS');
      expect((await Payment.findByPk(late.payment.id))!.status).toBe('refunded');
      expect(await quotaRemaining(tier.id)).toBe(0);
      expect(mockCreateRefund).toHaveBeenCalledTimes(1);

      // A duplicate delivery of the same success webhook changes nothing more.
      await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: late.bookingReference } } });
      expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation', () => {
    it('two concurrent organizer cancellations of one booking release its tickets and refund only once', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const { bookingId, bookingReference } = await createOnlineBooking(event.id, tier.id, 2);
      await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: bookingReference } } });
      expect(await quotaRemaining(tier.id)).toBe(3);
      mockCreateRefund.mockResolvedValue({ refund_status: 'PENDING' } as never);

      const results = await Promise.all(
        [1, 2, 3].map(() =>
          request(app)
            .post(`/api/organizer/bookings/${bookingId}/cancel`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ reason: 'double click' }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await quotaRemaining(tier.id)).toBe(5);
      expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    });

    it('cancelling an event also cancels its pending bookings, and can be re-run to finish a partial run', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const pending = await createOnlineBooking(event.id, tier.id);
      const paid = await createOnlineBooking(event.id, tier.id);
      await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: paid.bookingReference } } });
      mockCreateRefund.mockResolvedValue({ refund_status: 'PENDING' } as never);

      // Simulate an earlier run that marked the event cancelled and then died.
      await event.update({ status: 'cancelled' });

      const res = await request(app)
        .post(`/api/organizer/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Venue flooded' });
      expect(res.status).toBe(200);
      expect(res.body.cancelledBookings).toHaveLength(2);

      expect((await Booking.findByPk(pending.bookingId))!.status).toBe('cancelled');
      expect((await Booking.findByPk(pending.bookingId))!.refundAmountPaise).toBe(0);
      expect((await Booking.findByPk(paid.bookingId))!.refundAmountPaise).toBe(50000);
      expect(await quotaRemaining(tier.id)).toBe(5);

      // Nothing left to do — now it really is already cancelled.
      const again = await request(app)
        .post(`/api/organizer/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Venue flooded' });
      expect(again.status).toBe(400);
    });

    it('a payment completing after its event was cancelled is refunded, not confirmed', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const pending = await createOnlineBooking(event.id, tier.id);
      await request(app)
        .post(`/api/organizer/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Called off' });

      mockCreateRefund.mockResolvedValue({ refund_status: 'PENDING' } as never);
      await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: pending.bookingReference } } });

      const booking = (await Booking.findByPk(pending.bookingId))!;
      expect(booking.status).toBe('cancelled');
      expect(booking.refundAmountPaise).toBe(50000);
      expect(mockCreateRefund).toHaveBeenCalledTimes(1);
      expect(await quotaRemaining(tier.id)).toBe(5);
    });
  });

  describe('check-in', () => {
    it('admits a ticket exactly once when two gates scan it at the same moment', async () => {
      const { event, tier } = await createEvent({ price: 0 });
      const res = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { paymentMethod: 'cash' }));
      const ticket = (await Ticket.findOne({ where: { bookingId: res.body.bookingId } }))!;

      const scans = await Promise.all(
        [1, 2, 3, 4].map(() =>
          request(app)
            .post(`/api/organizer/events/${event.id}/checkin`)
            .set('Authorization', `Bearer ${volunteerToken}`)
            .send({ qrToken: ticket.qrToken }),
        ),
      );
      expect(scans.filter((s) => s.status === 200)).toHaveLength(1);
      expect(scans.filter((s) => s.status === 409)).toHaveLength(3);
    });
  });

  describe('roles', () => {
    it('lets a gate volunteer list events and check in, but nothing else', async () => {
      const events = await request(app).get('/api/organizer/events').set('Authorization', `Bearer ${volunteerToken}`);
      expect(events.status).toBe(200);
      const bookings = await request(app).get('/api/organizer/bookings').set('Authorization', `Bearer ${volunteerToken}`);
      expect(bookings.status).toBe(403);
      const dashboard = await request(app).get('/api/organizer/dashboard').set('Authorization', `Bearer ${volunteerToken}`);
      expect(dashboard.status).toBe(403);
    });

    it('keeps event cancellation and payout details owner-only', async () => {
      const { event } = await createEvent();
      const cancel = await request(app)
        .post(`/api/organizer/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'x' });
      expect(cancel.status).toBe(403);
      const verification = await request(app).post('/api/organizer/verification').set('Authorization', `Bearer ${staffToken}`).send({});
      expect(verification.status).toBe(403);
      // Staff can still do day-to-day work.
      const bookings = await request(app).get('/api/organizer/bookings').set('Authorization', `Bearer ${staffToken}`);
      expect(bookings.status).toBe(200);
    });
  });

  describe('stale pending online bookings', () => {
    async function age(bookingId: string) {
      const past = new Date(Date.now() - SEAT_HOLD_MS - 1000);
      await sequelize.query('UPDATE bookings SET created_at = :past WHERE id = :id', { replacements: { past, id: bookingId } });
    }

    it('releases the tickets of an unpaid booking once its payment window has passed', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const stale = await createOnlineBooking(event.id, tier.id, 2);
      const fresh = await createOnlineBooking(event.id, tier.id);
      await age(stale.bookingId);
      mockGetOrder.mockResolvedValue({ order_status: 'EXPIRED' } as never);

      await expireStalePendingOnlineBookings();

      expect((await Booking.findByPk(stale.bookingId))!.status).toBe('cancelled');
      expect((await Booking.findByPk(fresh.bookingId))!.status).toBe('pending');
      expect(await quotaRemaining(tier.id)).toBe(4);
    });

    it('confirms instead of cancelling when Cashfree says the order was actually paid', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const stale = await createOnlineBooking(event.id, tier.id);
      await age(stale.bookingId);
      mockGetOrder.mockResolvedValue({ order_status: 'PAID' } as never);

      await expireStalePendingOnlineBookings();

      expect((await Booking.findByPk(stale.bookingId))!.status).toBe('confirmed');
      expect(await quotaRemaining(tier.id)).toBe(4);
    });

    it('leaves the booking alone when Cashfree cannot be reached, and retries next run', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const stale = await createOnlineBooking(event.id, tier.id);
      await age(stale.bookingId);
      mockGetOrder.mockRejectedValue(new CashfreeApiError('timeout', 503, {}));

      await expireStalePendingOnlineBookings();
      expect((await Booking.findByPk(stale.bookingId))!.status).toBe('pending');
    });

    it('holds seats for only two minutes, so a sold-out show frees up quickly', async () => {
      expect(SEAT_HOLD_MS).toBe(2 * 60 * 1000);
      const { event, tier } = await createEvent({ quota: 3 });
      const hold = await createOnlineBooking(event.id, tier.id, 3);
      expect(await quotaRemaining(tier.id)).toBe(0);
      const full = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { quantity: 1 }));
      expect(full.status).toBe(409);

      await age(hold.bookingId);
      mockGetOrder.mockResolvedValue({ order_status: 'ACTIVE' } as never);
      mockGetOrderPayments.mockResolvedValue([]);
      await expireStalePendingOnlineBookings();

      expect((await Booking.findByPk(hold.bookingId))!.status).toBe('cancelled');
      expect(await quotaRemaining(tier.id)).toBe(3);
      const live = await request(app).get(`/api/events/${event.id}/availability`);
      expect(live.status).toBe(200);
      expect(live.body).toEqual({ eventId: event.id, tiers: [{ id: tier.id, available: 3 }], holdMinutes: 2 });
    });

    it('keeps the hold while a payment is going through at the gateway', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const hold = await createOnlineBooking(event.id, tier.id);
      await age(hold.bookingId);
      mockGetOrder.mockResolvedValue({ order_status: 'ACTIVE' } as never);
      mockGetOrderPayments.mockResolvedValue([{ cf_payment_id: 'p1', payment_status: 'PENDING' }] as never);

      await expireStalePendingOnlineBookings();
      expect((await Booking.findByPk(hold.bookingId))!.status).toBe('pending');
      mockGetOrderPayments.mockResolvedValue([]);
    });

    it("releases the same customer's abandoned hold when they try again", async () => {
      const { event, tier } = await createEvent({ quota: 3 });
      const email = `Retry-${suffix}@Example.com`;
      const first = await createOnlineBooking(event.id, tier.id, 3, email);
      expect(await quotaRemaining(tier.id)).toBe(0);
      mockGetOrder.mockResolvedValue({ order_status: 'ACTIVE' } as never);
      mockGetOrderPayments.mockResolvedValue([]);

      // Someone else is still blocked…
      const other = await request(app).post(`/api/events/${event.id}/bookings`).send(bookingBody(tier.id));
      expect(other.status).toBe(409);
      // …but the same customer retrying gets their seats back.
      const retry = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { quantity: 3, primaryContactEmail: email.toLowerCase() }));
      expect(retry.status).toBe(201);
      expect(retry.body.holdExpiresAt).toBeTruthy();
      expect((await Booking.findByPk(first.bookingId))!.status).toBe('cancelled');
      expect(await quotaRemaining(tier.id)).toBe(0);
      expect(await releaseCustomersOwnHolds(event.id, 'nobody@example.com')).toBe(0);
    });

    it('never touches cash bookings, which wait for the organizer', async () => {
      const { event, tier } = await createEvent({ quota: 5 });
      const res = await request(app)
        .post(`/api/events/${event.id}/bookings`)
        .send(bookingBody(tier.id, { paymentMethod: 'cash' }));
      await age(res.body.bookingId);

      await expireStalePendingOnlineBookings();
      expect((await Booking.findByPk(res.body.bookingId))!.status).toBe('pending');
    });
  });
});
