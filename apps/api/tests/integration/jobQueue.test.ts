import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { closeQueues, enqueueNotification, getNotificationsQueueForTests, registerJobHandler, startQueueWorkers } from '../../src/queue';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-await-in-loop
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the job');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Real Redis + real BullMQ workers (#38).
describe('background job queue (real Redis)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  beforeAll(async () => {
    process.env.QUEUE_ENABLED = 'true';
    process.env.QUEUE_BACKOFF_MS = '50';
    mockIsEmailConfigured.mockReturnValue(true);

    const queue = await getNotificationsQueueForTests();
    await queue.obliterate({ force: true });
    await startQueueWorkers([]);

    const organizer = await Organizer.create({
      name: `Queue Test Org ${suffix}`,
      slug: `queue-test-org-${suffix}`,
      cashfreeVendorId: `queue_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `queue-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    await closeQueues();
    delete process.env.QUEUE_ENABLED;
    delete process.env.QUEUE_BACKOFF_MS;
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

  beforeEach(() => mockSendEmail.mockClear());

  it('runs an enqueued job on the worker and retries it after a failure', async () => {
    const seen: unknown[] = [];
    let attempts = 0;
    registerJobHandler('test-flaky', async (data) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient SMTP failure');
      seen.push(data);
    });

    await enqueueNotification('test-flaky', { value: 42 });
    await waitFor(() => seen.length === 1);
    expect(attempts).toBe(2);
    expect(seen[0]).toEqual({ value: 42 });
  });

  it('de-duplicates by jobId (a webhook delivered twice sends one email)', async () => {
    let runs = 0;
    registerJobHandler('test-dedupe', async () => {
      runs += 1;
    });
    await enqueueNotification('test-dedupe', {}, { jobId: `dedupe-${suffix}` });
    await waitFor(() => runs === 1);
    await enqueueNotification('test-dedupe', {}, { jobId: `dedupe-${suffix}` });
    await new Promise((r) => setTimeout(r, 300));
    expect(runs).toBe(1);
  });

  it('runs inline when the queue is disabled', async () => {
    process.env.QUEUE_ENABLED = 'false';
    try {
      let ran = false;
      registerJobHandler('test-inline', async () => {
        ran = true;
      });
      await enqueueNotification('test-inline', {});
      expect(ran).toBe(true); // already done by the time enqueue resolves
    } finally {
      process.env.QUEUE_ENABLED = 'true';
    }
  });

  it('sends the booking confirmation email through the queue, not on the request', async () => {
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Queue Test Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    expect(created.status).toBe(201);
    const eventId = created.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;

    const email = `queue-customer-${suffix}@example.com`;
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 2,
      primaryContactName: 'Queue Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'cash',
    });
    expect(res.status).toBe(201);

    await waitFor(() => mockSendEmail.mock.calls.some((c) => c[0].to === email));
    const call = mockSendEmail.mock.calls.find((c) => c[0].to === email)!;
    expect(call[0].subject).toContain(res.body.bookingReference);
    // Invoice + banner image + one inline QR per ticket.
    expect(call[0].attachments!.map((a) => a.filename)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Invoice-.+\.pdf$/), 'event-banner.png', 'Ticket-1-QR.png', 'Ticket-2-QR.png']),
    );

    const queue = await getNotificationsQueueForTests();
    const job = await queue.getJob(`booking-confirmation-${res.body.bookingId}`);
    expect(job).toBeTruthy();
    await waitFor(async () => (await job!.getState()) === 'completed');
    // The designed email renders a banner, QR codes and an invoice PDF,
    // which is slow under Jest's transpiled runtime.
  }, 30000);
});
