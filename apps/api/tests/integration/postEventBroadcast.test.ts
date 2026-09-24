import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { checkAndSendPostEventBroadcasts, findEventsNeedingPostEventEmail, postEventSendTime } from '../../src/services/postEventBroadcast';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

// Booking confirmations are sent in the background and can land at any
// point, so only look at the post-event emails.
const broadcastCalls = () => mockSendEmail.mock.calls.filter((c) => !c[0].subject.startsWith('Booking confirmed'));

describe('postEventSendTime', () => {
  it('is 10:00 IST on the day after the event, in IST', () => {
    // 2026-12-25 21:00 IST (15:30 UTC) -> 2026-12-26 10:00 IST (04:30 UTC)
    expect(postEventSendTime(new Date('2026-12-25T15:30:00Z')).toISOString()).toBe('2026-12-26T04:30:00.000Z');
    // 2026-12-26 01:00 IST is still the 26th in India, though the 25th in UTC.
    expect(postEventSendTime(new Date('2026-12-25T19:30:00Z')).toISOString()).toBe('2026-12-27T04:30:00.000Z');
  });
});

describe('next-day post-event broadcast (#57, real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  beforeAll(async () => {
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    mockIsEmailConfigured.mockReturnValue(true);
    const organizer = await Organizer.create({
      name: `Broadcast Org <b>${suffix}</b>`,
      slug: `broadcast-org-${suffix}`,
      cashfreeVendorId: `broadcast_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `broadcast-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  beforeEach(() => mockSendEmail.mockClear());

  afterAll(async () => {
    delete process.env.WEB_PUBLIC_URL;
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

  async function createEventWithBooking(email: string, confirm = true) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Broadcast Event ${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    const eventId = res.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const booked = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Broadcast Attendee',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'cash',
    });
    if (confirm) await Booking.update({ status: 'confirmed' }, { where: { id: booked.body.bookingId } });
    return { eventId, bookingReference: booked.body.bookingReference as string };
  }

  it('sends once, the morning after, with the gallery and feedback links — HTML-escaped', async () => {
    const email = `broadcast-yes-${suffix}@example.com`;
    const { eventId, bookingReference } = await createEventWithBooking(email);
    const eventDate = new Date('2026-12-25T13:30:00Z'); // 19:00 IST
    await Event.update(
      { eventDate, galleryUrl: 'https://drive.google.com/drive/folders/abc?x=1&y=2', galleryNote: 'Photos <3' },
      { where: { id: eventId } },
    );

    // Evening of the event: too early.
    expect((await findEventsNeedingPostEventEmail(new Date('2026-12-25T18:00:00Z'))).map((e) => e.id)).not.toContain(eventId);

    const morningAfter = new Date('2026-12-26T05:00:00Z');
    const results = await checkAndSendPostEventBroadcasts(morningAfter);
    expect(results.find((r) => r.eventId === eventId)?.emailsSent).toBe(1);

    const call = broadcastCalls().find((c) => c[0].to === email)!;
    expect(call[0].subject).toContain('Your photos from');
    expect(call[0].html).toContain('https://drive.google.com/drive/folders/abc?x=1&amp;y=2');
    expect(call[0].html).toContain('Photos &lt;3');
    expect(call[0].html).toContain(`https://events.test.example/bookings/${bookingReference}/feedback`);
    expect(call[0].html).not.toContain('<b>');

    // Never twice.
    mockSendEmail.mockClear();
    await checkAndSendPostEventBroadcasts(new Date('2026-12-26T06:00:00Z'));
    expect(broadcastCalls().some((c) => c[0].to === email)).toBe(false);
  });

  it('skips unconfirmed bookings, cancelled events, and events long past', async () => {
    const pendingEmail = `broadcast-pending-${suffix}@example.com`;
    const pending = await createEventWithBooking(pendingEmail, false);
    await Event.update({ eventDate: new Date('2026-12-25T13:30:00Z') }, { where: { id: pending.eventId } });

    const cancelled = await createEventWithBooking(`broadcast-cancelled-${suffix}@example.com`);
    await Event.update({ eventDate: new Date('2026-12-25T13:30:00Z'), status: 'cancelled' }, { where: { id: cancelled.eventId } });

    const old = await createEventWithBooking(`broadcast-old-${suffix}@example.com`);
    await Event.update({ eventDate: new Date('2026-12-01T13:30:00Z') }, { where: { id: old.eventId } });
    mockSendEmail.mockClear();

    const found = (await findEventsNeedingPostEventEmail(new Date('2026-12-26T05:00:00Z'))).map((e) => e.id);
    expect(found).toContain(pending.eventId);
    expect(found).not.toContain(cancelled.eventId);
    expect(found).not.toContain(old.eventId);

    const results = await checkAndSendPostEventBroadcasts(new Date('2026-12-26T05:00:00Z'));
    expect(results.find((r) => r.eventId === pending.eventId)?.emailsSent).toBe(0);
    expect(broadcastCalls()).toHaveLength(0);
  });
});
