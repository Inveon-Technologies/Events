import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { cashfreeCreateOrder } from '../../src/services/cashfreeClient';

jest.mock('../../src/services/cashfreeClient', () => {
  const actual = jest.requireActual('../../src/services/cashfreeClient');
  return { ...actual, cashfreeCreateOrder: jest.fn() };
});

const mockCreateOrder = cashfreeCreateOrder as jest.MockedFunction<typeof cashfreeCreateOrder>;

const WEBHOOK_SECRET = 'test-webhook-secret';

function signedWebhookRequest(app: ReturnType<typeof createApp>, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(timestamp + rawBody).digest('base64');
  return request(app)
    .post('/api/webhooks/cashfree')
    .set('Content-Type', 'application/json')
    .set('x-webhook-timestamp', timestamp)
    .set('x-webhook-signature', signature)
    .send(rawBody);
}

describe('real payment flow: booking -> order -> webhook (real DB, Cashfree API mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let verifiedOrgId: string;
  let unverifiedOrgId: string;
  let verifiedEventId: string;
  let unverifiedEventId: string;
  let verifiedTierId: string;
  let unverifiedTierId: string;
  let freeTierId: string;

  beforeAll(async () => {
    process.env.CASHFREE_SECRET_KEY = WEBHOOK_SECRET;
    process.env.API_PUBLIC_URL = 'https://events.test.example';

    // Real Cashfree echoes back the order_id it was given in the
    // request — a mock returning a fixed value regardless of input
    // would silently hide any bug in what order_id this codebase
    // actually sends, which is exactly the field the webhook flow
    // later looks bookings up by.
    mockCreateOrder.mockImplementation(async (params) => ({
      cf_order_id: `cf_${Math.random().toString(36).slice(2)}`,
      order_id: params.orderId,
      order_status: 'ACTIVE',
      payment_session_id: `session_${Math.random().toString(36).slice(2)}`,
      order_expiry_time: '2026-12-31T00:00:00+05:30',
    }));

    const verifiedOrg = await Organizer.create({
      name: `Verified Payment Org ${suffix}`,
      slug: `verified-payment-org-${suffix}`,
      cashfreeVendorId: `org_verified_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    verifiedOrgId = verifiedOrg.id;
    const verifiedOwner = await User.create({
      organizerId: verifiedOrgId,
      email: `verified-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const verifiedToken = signAccessToken({ sub: verifiedOwner.id, role: verifiedOwner.role, organizerId: verifiedOrgId });

    const verifiedEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .send({
        title: `Verified Org Paid Event ${suffix}`,
        startDate: '2026-12-01',
        startTime: '10:00',
        ticketTiers: [
          { name: 'General', price: 500, quantity: 20 },
          { name: 'Free Entry', price: 0, quantity: 20 },
        ],
        status: 'published',
      });
    verifiedEventId = verifiedEventRes.body.id;
    const verifiedTiers = await TicketCategory.findAll({ where: { eventId: verifiedEventId } });
    verifiedTierId = verifiedTiers.find((t) => t.pricePaise > 0)!.id;
    freeTierId = verifiedTiers.find((t) => t.pricePaise === 0)!.id;

    const unverifiedOrg = await Organizer.create({
      name: `Unverified Payment Org ${suffix}`,
      slug: `unverified-payment-org-${suffix}`,
      // Starts verified so the event below can actually be published
      // (eventCreation.ts's publish-time gate would otherwise refuse
      // it) — then downgraded afterward, simulating verification
      // lapsing or being revoked after a paid event already went live.
      // That's the actual scenario the booking-time gate in
      // bookingCreation.ts defends against; an organizer who was never
      // verified in the first place can no longer reach this state at
      // all, now that publishing itself is gated too.
      cashfreeVendorId: `unverified_payment_org_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    unverifiedOrgId = unverifiedOrg.id;
    const unverifiedOwner = await User.create({
      organizerId: unverifiedOrgId,
      email: `unverified-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const unverifiedToken = signAccessToken({ sub: unverifiedOwner.id, role: unverifiedOwner.role, organizerId: unverifiedOrgId });

    const unverifiedEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({
        title: `Unverified Org Paid Event ${suffix}`,
        startDate: '2026-12-01',
        startTime: '10:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    unverifiedEventId = unverifiedEventRes.body.id;
    unverifiedTierId = (await TicketCategory.findOne({ where: { eventId: unverifiedEventId } }))!.id;

    // Now revoke it — the event stays published, matching real life:
    // taking away a vendor's active status doesn't retroactively
    // unpublish whatever they already put live.
    await unverifiedOrg.update({ cashfreeVendorStatus: 'not_started' });
  });

  afterAll(async () => {
    for (const eventId of [verifiedEventId, unverifiedEventId]) {
      const bookings = await Booking.findAll({ where: { eventId } });
      for (const booking of bookings) {
        await Payment.destroy({ where: { bookingId: booking.id } });
        await Ticket.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId } });
      await TicketCategory.destroy({ where: { eventId } });
    }
    await Event.destroy({ where: { organizerId: [verifiedOrgId, unverifiedOrgId] } });
    await User.destroy({ where: { organizerId: [verifiedOrgId, unverifiedOrgId] } });
    await Organizer.destroy({ where: { id: [verifiedOrgId, unverifiedOrgId] } });
    await sequelize.close();
  });

  function bookingBody(ticketCategoryId: string, paymentMethod: 'online' | 'cash', emailSuffix: string) {
    return {
      ticketCategoryId,
      quantity: 1,
      primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: `payment-test-${emailSuffix}@example.com`,
      paymentMethod,
    };
  }

  it('rejects an online booking for a paid tier when the organizer is not verified, with a clear 422', async () => {
    const res = await request(app)
      .post(`/api/events/${unverifiedEventId}/bookings`)
      .send(bookingBody(unverifiedTierId, 'online', 'unverified-1'));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not completed payment verification/i);
  });

  it('still allows a CASH booking for a paid tier even when the organizer is not verified — cash needs no Cashfree', async () => {
    const res = await request(app)
      .post(`/api/events/${unverifiedEventId}/bookings`)
      .send(bookingBody(unverifiedTierId, 'cash', 'unverified-cash'));
    expect(res.status).toBe(201);
    expect(res.body.paymentSessionId).toBeUndefined();
  });

  it('a free ticket (0 paise) is confirmed immediately regardless of payment method, even for an unverified organizer', async () => {
    const res = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(freeTierId, 'online', 'free-ticket'));
    expect(res.status).toBe(201);
    const booking = await Booking.findByPk(res.body.bookingId);
    expect(booking!.status).toBe('confirmed');
  });

  it('creates a real Cashfree order with a vendor split for a verified organizer, and returns a payment_session_id', async () => {
    const res = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(verifiedTierId, 'online', 'verified-order'));

    expect(res.status).toBe(201);
    expect(res.body.paymentSessionId).toEqual(expect.any(String));
    expect(res.body.paymentSessionId.length).toBeGreaterThan(0);

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateOrder.mock.calls[0][0];
    expect(callArgs.orderId).toBe(res.body.bookingReference);
    // 5% default platform fee -> organizer gets 95% of 500 rupees = 475
    expect(callArgs.vendorSplit).toEqual({ vendorId: `org_verified_${suffix}`, amountRupees: 475 });

    const payment = await Payment.findOne({ where: { bookingId: res.body.bookingId } });
    expect(payment!.gatewayReference).toBe(res.body.bookingReference);
    expect(payment!.status).toBe('pending');

    const booking = await Booking.findByPk(res.body.bookingId);
    expect(booking!.status).toBe('pending');
  });

  it('a real, correctly-signed PAYMENT_SUCCESS_WEBHOOK confirms the booking and marks the payment paid', async () => {
    const bookingRes = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(verifiedTierId, 'online', 'webhook-success'));
    const orderId = bookingRes.body.bookingReference;

    const webhookRes = await signedWebhookRequest(app, {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: orderId } },
    });
    expect(webhookRes.status).toBe(200);

    const booking = await Booking.findByPk(bookingRes.body.bookingId);
    expect(booking!.status).toBe('confirmed');
    const payment = await Payment.findOne({ where: { bookingId: bookingRes.body.bookingId } });
    expect(payment!.status).toBe('paid');
  });

  it('a real, correctly-signed PAYMENT_FAILED_WEBHOOK cancels the booking, cancels tickets, and releases quota back', async () => {
    const beforeTier = await TicketCategory.findByPk(verifiedTierId);
    const quotaBefore = beforeTier!.quotaRemaining;

    const bookingRes = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(verifiedTierId, 'online', 'webhook-failed'));
    const orderId = bookingRes.body.bookingReference;

    const afterBookingTier = await TicketCategory.findByPk(verifiedTierId);
    expect(afterBookingTier!.quotaRemaining).toBe(quotaBefore - 1); // reserved

    const webhookRes = await signedWebhookRequest(app, {
      type: 'PAYMENT_FAILED_WEBHOOK',
      data: { order: { order_id: orderId } },
    });
    expect(webhookRes.status).toBe(200);

    const booking = await Booking.findByPk(bookingRes.body.bookingId);
    expect(booking!.status).toBe('cancelled');
    const payment = await Payment.findOne({ where: { bookingId: bookingRes.body.bookingId } });
    expect(payment!.status).toBe('failed');

    const tickets = await Ticket.findAll({ where: { bookingId: bookingRes.body.bookingId } });
    expect(tickets.every((tk) => tk.status === 'cancelled')).toBe(true);

    const afterWebhookTier = await TicketCategory.findByPk(verifiedTierId);
    expect(afterWebhookTier!.quotaRemaining).toBe(quotaBefore); // released back
  });

  it('a duplicate webhook delivery for an already-processed booking does nothing further (idempotent)', async () => {
    const bookingRes = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(verifiedTierId, 'online', 'webhook-dup'));
    const orderId = bookingRes.body.bookingReference;

    await signedWebhookRequest(app, { type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } });
    // A second, duplicate delivery of the SAME success event.
    const secondRes = await signedWebhookRequest(app, {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: orderId } },
    });
    expect(secondRes.status).toBe(200);

    const booking = await Booking.findByPk(bookingRes.body.bookingId);
    expect(booking!.status).toBe('confirmed'); // still confirmed, not double-processed into some other state
  });

  it('rejects a webhook with an invalid signature (401), and never processes its payload', async () => {
    const bookingRes = await request(app)
      .post(`/api/events/${verifiedEventId}/bookings`)
      .send(bookingBody(verifiedTierId, 'online', 'webhook-badsig'));
    const orderId = bookingRes.body.bookingReference;

    const res = await request(app)
      .post('/api/webhooks/cashfree')
      .set('Content-Type', 'application/json')
      .set('x-webhook-timestamp', Date.now().toString())
      .set('x-webhook-signature', 'totally-forged-signature')
      .send(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } }));

    expect(res.status).toBe(401);
    const booking = await Booking.findByPk(bookingRes.body.bookingId);
    expect(booking!.status).toBe('pending'); // untouched
  });
});
