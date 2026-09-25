import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { organizerCancelBooking } from '../../src/services/bookingCancellation';
import { sendEventReminder } from '../../src/services/eventReminders';
import { sendPostEventBroadcast } from '../../src/services/postEventBroadcast';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

type AiSensyBody = { campaignName: string; destination: string; userName: string; templateParams: string[] };

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the WhatsApp send');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
}

// WhatsApp notifications through AiSensy (real DB, AiSensy API mocked).
describe('WhatsApp notifications', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let fetchMock: jest.SpyInstance;
  const sent: AiSensyBody[] = [];
  const sentTo = (campaign: string, destination: string) =>
    sent.filter((b) => b.campaignName === campaign && b.destination === destination);

  beforeAll(async () => {
    process.env.WHATSAPP_PROVIDER = 'aisensy';
    process.env.AISENSY_API_KEY = 'test-key';
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    const realFetch = global.fetch;
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('aisensy.com')) {
        sent.push(JSON.parse(String(init?.body)));
        return new Response('{"success":"true"}', { status: 200 });
      }
      return realFetch(input, init);
    });

    const organizer = await Organizer.create({
      name: `WhatsApp Org ${suffix}`,
      slug: `whatsapp-org-${suffix}`,
      cashfreeVendorId: `whatsapp_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `whatsapp-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    fetchMock.mockRestore();
    for (const k of ['WHATSAPP_PROVIDER', 'AISENSY_API_KEY', 'WEB_PUBLIC_URL']) delete process.env[k];
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

  async function book(phone: string) {
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `WhatsApp Trek ${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '06:30',
        venueName: 'Rajgad Base',
        city: 'Pune',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    const eventId = created.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const res = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 2,
        primaryContactName: 'Asha Patil',
        primaryContactWhatsapp: phone,
        primaryContactEmail: `whatsapp-${Math.random()}@example.com`,
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(201);
    return { eventId, bookingId: res.body.bookingId as string, reference: res.body.bookingReference as string };
  }

  it('sends the booking confirmation with the booking details, to a normalized number', async () => {
    const { reference } = await book('098765 43210');
    await waitFor(() => sentTo('booking_confirmation', '919876543210').some((b) => b.templateParams[3] === reference));
    const msg = sentTo('booking_confirmation', '919876543210').find((b) => b.templateParams[3] === reference)!;
    expect(msg.userName).toBe('Asha Patil');
    expect(msg.templateParams[0]).toBe('Asha Patil');
    expect(msg.templateParams[1]).toMatch(/^WhatsApp Trek/);
    expect(msg.templateParams[2]).toBe('Fri, 25 Dec, 2026, 6:30 am'); // entered as 6:30 AM India time
    expect(msg.templateParams[4]).toBe('2'); // tickets
    expect(msg.templateParams[5]).toBe('https://events.test.example/bookings/my');
  });

  it('sends the cancellation with the refund line', async () => {
    const { bookingId, reference } = await book('9876500001');
    await Booking.update({ status: 'confirmed' }, { where: { id: bookingId } });
    await organizerCancelBooking(bookingId, organizerId, 'Weather');
    const msg = sentTo('booking_cancelled', '919876500001').find((b) => b.templateParams[1] === reference);
    expect(msg).toBeTruthy();
    expect(msg!.templateParams[3]).toBe('No payment was due for this booking.');
  });

  it('tells a paid cash booking that the organizer will arrange the refund', async () => {
    const { bookingId, reference } = await book('9876500005');
    await Booking.update({ status: 'confirmed', totalAmountPaise: 150000 }, { where: { id: bookingId } });
    await organizerCancelBooking(bookingId, organizerId, 'Weather');
    const msg = sentTo('booking_cancelled', '919876500005').find((b) => b.templateParams[1] === reference);
    expect(msg!.templateParams[3]).toBe('A refund of ₹1,500 is due; the organizer will arrange it with you.');
  });

  it('sends the 3-hour reminder and the next-day thank-you to confirmed bookings only', async () => {
    const { eventId, bookingId, reference } = await book('9876500002');
    const pending = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: (await TicketCategory.findOne({ where: { eventId } }))!.id,
        quantity: 1,
        primaryContactName: 'Pending Person',
        primaryContactWhatsapp: '9876500003',
        primaryContactEmail: `whatsapp-pending-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    expect(pending.status).toBe(201);
    // Free events confirm straight away; make this one pending like an unpaid booking.
    await Booking.update({ status: 'pending' }, { where: { id: pending.body.bookingId } });
    await Booking.update({ status: 'confirmed' }, { where: { id: bookingId } });
    await Event.update({ galleryUrl: 'https://drive.google.com/drive/folders/xyz' }, { where: { id: eventId } });

    const event = (await Event.findByPk(eventId))!;
    await sendEventReminder(event);
    const reminder = sentTo('event_reminder', '919876500002').find((b) => b.templateParams[5] === reference);
    expect(reminder).toBeTruthy();
    expect(reminder!.templateParams[2]).toBe('6:30 am');
    expect(reminder!.templateParams[3]).toMatch(/Rajgad Base/);
    expect(reminder!.templateParams[4]).toMatch(/^https:\/\/www\.google\.com\/maps/);
    expect(sentTo('event_reminder', '919876500003')).toHaveLength(0);

    await sendPostEventBroadcast((await Event.findByPk(eventId))!);
    const thanks = sentTo('post_event_thanks', '919876500002');
    expect(thanks).toHaveLength(1);
    expect(thanks[0].templateParams[2]).toBe(`WhatsApp Org ${suffix}`);
    expect(thanks[0].templateParams[3]).toBe('See the photos and videos here: https://drive.google.com/drive/folders/xyz');
    expect(thanks[0].templateParams[4]).toBe(`https://events.test.example/bookings/${reference}/feedback`);
    expect(sentTo('post_event_thanks', '919876500003')).toHaveLength(0);
  });

  it('sends nothing when WhatsApp is not configured', async () => {
    delete process.env.WHATSAPP_PROVIDER;
    try {
      const before = sent.length;
      await book('9876500004');
      await new Promise((r) => setTimeout(r, 300));
      expect(sent.length).toBe(before);
    } finally {
      process.env.WHATSAPP_PROVIDER = 'aisensy';
    }
  });
});
