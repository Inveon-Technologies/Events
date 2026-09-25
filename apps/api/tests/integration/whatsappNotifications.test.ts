import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { organizerCancelBooking } from '../../src/services/bookingCancellation';
import { sendEventReminder } from '../../src/services/eventReminders';
import { sendPostEventBroadcast } from '../../src/services/postEventBroadcast';
import { ticketLinkToken } from '../../src/services/ticketLinks';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

type AiSensyBody = {
  campaignName: string;
  destination: string;
  userName: string;
  templateParams: string[];
  media?: { url: string; filename: string };
  buttons?: unknown[];
};

async function statusOf(
  bookingId: string,
  field: 'confirmationWhatsappStatus' | 'confirmationEmailStatus',
  want: string,
): Promise<string | null> {
  const deadline = Date.now() + 5000;
  let value: string | null = null;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    value = (await Booking.findByPk(bookingId))?.[field] ?? null;
    if (value === want) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
  return value;
}

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
  let fail = false;
  const sentTo = (campaign: string, destination: string) =>
    sent.filter((b) => b.campaignName === campaign && b.destination === destination);

  beforeAll(async () => {
    process.env.WHATSAPP_PROVIDER = 'aisensy';
    process.env.AISENSY_API_KEY = 'test-key';
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    const realFetch = global.fetch;
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('aisensy.com')) {
        if (fail) return new Response('{"message":"Template paused"}', { status: 400 });
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

  it('sends the booking confirmation like the ticket mockup: card image, details, View Ticket + PDF buttons', async () => {
    const { reference, bookingId } = await book('098765 43210');
    await waitFor(() => sentTo('booking_confirmation', '919876543210').some((b) => b.templateParams[7] === reference));
    const msg = sentTo('booking_confirmation', '919876543210').find((b) => b.templateParams[7] === reference)!;
    const token = ticketLinkToken(reference);
    expect(msg.userName).toBe('Asha Patil');
    expect(msg.templateParams).toEqual([
      'Asha Patil',
      expect.stringMatching(/^WhatsApp Trek/),
      'Your ticket is ready.', // free event
      'Friday, 25 December 2026', // India time
      'Starts at: 6:30 AM',
      'Rajgad Base',
      `${reference.replace('-BKG-', '-TKT-')}-01 to -02 (2 tickets)`,
      reference,
      `WhatsApp Org ${suffix} via your ticket page`,
    ]);
    expect(msg.media).toEqual({ url: `https://events.test.example/api/t/${token}/card.png`, filename: `Ticket-${reference}.png` });
    expect(msg.buttons).toEqual([
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: token }] },
    ]);

    // Recorded for the ticket page's "Ticket delivered to" (saved just
    // after the send, so poll for it).
    expect(await statusOf(bookingId, 'confirmationWhatsappStatus', 'sent')).toBe('sent');
    expect(await statusOf(bookingId, 'confirmationEmailStatus', 'skipped')).toBe('skipped'); // email isn't configured here

    // The "Download Ticket PDF" button's URL (token at the end) leads to the PDF.
    const pdf = await request(app).get(`/api/ticket-pdf/${token}`);
    expect(pdf.status).toBe(302);
    expect(pdf.headers.location).toBe(`/api/t/${token}/tickets.pdf`);
  });

  it('records a failed WhatsApp confirmation so the ticket page can say so', async () => {
    fail = true;
    try {
      const { bookingId } = await book('9876500009');
      expect(await statusOf(bookingId, 'confirmationWhatsappStatus', 'failed')).toBe('failed');
    } finally {
      fail = false;
    }
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
