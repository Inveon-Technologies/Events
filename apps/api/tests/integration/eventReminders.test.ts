import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { checkAndSendEventReminders, findEventsNeedingReminder, sendEventReminder } from '../../src/services/eventReminders';

// Every booking here also sends its confirmation email in the background,
// which renders one 400px QR PNG per ticket. PNG encoding runs ~50x slower
// inside Jest's sandbox (about 1s per ticket), which pushed the 3-ticket
// test past the 5s timeout on CI. These tests are about reminders, not QR
// images; the booking-confirmation tests (jobQueue) still render real ones.
jest.mock('../../src/services/qrCode', () => ({
  generateTicketQrPng: jest.fn().mockResolvedValue(Buffer.from('qr')),
}));
jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

describe('real 3-hour event reminder system (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  beforeAll(async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    const organizer = await Organizer.create({
      name: `Reminder Test Org ${suffix}`,
      slug: `reminder-test-org-${suffix}`,
      cashfreeVendorId: `reminder_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `reminder-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  beforeEach(() => {
    mockSendEmail.mockClear();
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

  async function createEventAndTier(venue: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Reminder Test Event ${suffix}-${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
        ...venue,
      });
    const eventId = res.body.id as string;
    const tId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    return { eventId, tierId: tId };
  }

  async function setEventDate(eventId: string, date: Date) {
    await Event.update({ eventDate: date }, { where: { id: eventId } });
  }

  async function createConfirmedBooking(eventId: string, tId: string, email: string, attendeeName: string) {
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tId, quantity: 1, primaryContactName: attendeeName,
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: email, paymentMethod: 'cash',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
    return res.body.bookingId as string;
  }

  it('sends a real reminder for an event now within the real 3-hour window, with a real Maps link', async () => {
    const { eventId, tierId: tId } = await createEventAndTier({ venueName: 'Real Reminder Venue', city: 'Pune' });
    await setEventDate(eventId, new Date(Date.now() + 2.5 * 60 * 60 * 1000));
    await createConfirmedBooking(eventId, tId, `reminder-in-window-${suffix}@example.com`, 'In Window Attendee');

    const results = await checkAndSendEventReminders();
    const thisEventResult = results.find((r) => r.eventId === eventId);
    expect(thisEventResult).toBeTruthy();
    expect(thisEventResult!.emailsSent).toBe(1);
    expect(thisEventResult!.attendeesCovered).toBe(1);

    const call = mockSendEmail.mock.calls.find((c) => c[0].to === `reminder-in-window-${suffix}@example.com` && c[0].subject.includes('starts in 3 hours'));
    expect(call).toBeTruthy();
    expect(call![0].subject).toContain('starts in 3 hours');
    expect(call![0].html).toContain('In Window Attendee');
    expect(call![0].html).toContain('google.com/maps');

    const event = await Event.findByPk(eventId);
    expect(event!.reminderSentAt).not.toBeNull();
  });

  it('does not send a reminder for an event 4 hours away — outside the real window', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    await setEventDate(eventId, new Date(Date.now() + 4 * 60 * 60 * 1000));
    await createConfirmedBooking(eventId, tId, `reminder-too-early-${suffix}@example.com`, 'Too Early Attendee');

    const found = await findEventsNeedingReminder();
    expect(found.find((e) => e.id === eventId)).toBeUndefined();
  });

  it('does not send a reminder for an event that has already started', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    // Booked while still upcoming (bookings on a started event are refused).
    await createConfirmedBooking(eventId, tId, `reminder-already-started-${suffix}@example.com`, 'Already Started Attendee');
    await setEventDate(eventId, new Date(Date.now() - 60 * 60 * 1000));

    const found = await findEventsNeedingReminder();
    expect(found.find((e) => e.id === eventId)).toBeUndefined();
  });

  it('never sends the same event\'s reminder twice — real idempotency via reminder_sent_at', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    await setEventDate(eventId, new Date(Date.now() + 2 * 60 * 60 * 1000));
    await createConfirmedBooking(eventId, tId, `reminder-once-${suffix}@example.com`, 'Once Attendee');

    await checkAndSendEventReminders();
    const reminderCallsFirst = mockSendEmail.mock.calls.filter((c) => c[0].subject.includes('starts in 3 hours'));
    expect(reminderCallsFirst).toHaveLength(1);

    mockSendEmail.mockClear();
    await checkAndSendEventReminders();
    const reminderCallsSecond = mockSendEmail.mock.calls.filter((c) => c[0].subject.includes('starts in 3 hours'));
    expect(reminderCallsSecond).toHaveLength(0);
  });

  it('two overlapping runs (e.g. two API processes) send the reminder exactly once', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    await setEventDate(eventId, new Date(Date.now() + 2 * 60 * 60 * 1000));
    const email = `reminder-race-${suffix}@example.com`;
    await createConfirmedBooking(eventId, tId, email, 'Race Attendee');
    mockSendEmail.mockClear();

    const event = await Event.findByPk(eventId);
    const [a, b] = await Promise.all([sendEventReminder(event!), sendEventReminder(event!)]);
    expect(a.emailsSent + b.emailsSent).toBe(1);
    expect(mockSendEmail.mock.calls.filter((c) => c[0].to === email && c[0].subject.includes('starts in 3 hours'))).toHaveLength(1);
  });

  it('sends one email per multi-attendee booking (its only address), greeting every attendee by name', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    await setEventDate(eventId, new Date(Date.now() + 2 * 60 * 60 * 1000));
    const bookingRes = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tId, quantity: 3, primaryContactName: 'Group Booker',
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: `reminder-group-${suffix}@example.com`, paymentMethod: 'cash',
      attendeeNames: ['Attendee One', 'Attendee Two', 'Attendee Three'],
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: bookingRes.body.bookingId } });

    const results = await checkAndSendEventReminders();
    const thisEventResult = results.find((r) => r.eventId === eventId);
    expect(thisEventResult!.emailsSent).toBe(1);
    expect(thisEventResult!.attendeesCovered).toBe(3);
    const call = mockSendEmail.mock.calls.find(
      (c) => c[0].to === `reminder-group-${suffix}@example.com` && c[0].subject.includes('starts in 3 hours'),
    );
    expect(call![0].html).toContain('Attendee One, Attendee Two and Attendee Three');
  });

  it('skips a cancelled ticket within an otherwise-confirmed booking', async () => {
    const { eventId, tierId: tId } = await createEventAndTier();
    await setEventDate(eventId, new Date(Date.now() + 2 * 60 * 60 * 1000));
    const bookingId = await createConfirmedBooking(eventId, tId, `reminder-cancelled-ticket-${suffix}@example.com`, 'Cancelled Ticket Attendee');
    const ticket = await Ticket.findOne({ where: { bookingId } });
    await ticket!.update({ status: 'cancelled' });

    const results = await checkAndSendEventReminders();
    const thisEventResult = results.find((r) => r.eventId === eventId);
    expect(thisEventResult!.emailsSent).toBe(0);
  });
});
