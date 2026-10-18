import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { ticketLinkToken, verifyTicketLinkToken } from '../../src/services/ticketLinks';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

type AiSensyBody = {
  campaignName: string;
  destination: string;
  userName: string;
  templateParams: string[];
  media?: { url: string; filename: string };
  buttons?: { parameters: { text: string }[] }[];
};

async function waitFor(check: () => boolean, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the sends');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
}

jest.setTimeout(30000);

// Group bookings: all tickets to the buyer, or each one to its own
// attendee's WhatsApp and email (real DB, AiSensy and SMTP mocked).
describe('sending group tickets to each attendee', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let eventId: string;
  let tierId: string;
  let fetchMock: jest.SpyInstance;
  const sent: AiSensyBody[] = [];

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
      name: `Group Org ${suffix}`,
      slug: `group-org-${suffix}`,
      contactPhone: '07887503856',
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `group-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const auth = signAccessToken({ sub: user.id, role: user.role, organizerId });
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        title: `Group Trek ${suffix}`,
        startDate: '2026-12-25',
        startTime: '06:30',
        venueName: 'Rajgad Base',
        city: 'Pune',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    eventId = created.body.id as string;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
  });

  afterAll(async () => {
    fetchMock.mockRestore();
    for (const k of ['WHATSAPP_PROVIDER', 'AISENSY_API_KEY', 'WEB_PUBLIC_URL']) delete process.env[k];
    const bookings = await Booking.findAll({ where: { eventId } });
    for (const booking of bookings) {
      await Payment.destroy({ where: { bookingId: booking.id } });
      await Ticket.destroy({ where: { bookingId: booking.id } });
    }
    await Booking.destroy({ where: { eventId } });
    await TicketCategory.destroy({ where: { eventId } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  beforeEach(() => mockSendEmail.mockClear());

  const book = (body: Record<string, unknown>) =>
    request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 3,
        attendeeNames: ['Asha Patil', 'Ravi Kale', 'Meera Patil'],
        primaryContactName: 'Asha Patil',
        primaryContactWhatsapp: '9876511111',
        primaryContactEmail: `asha-${suffix}@example.com`,
        paymentMethod: 'cash',
        ...body,
      });

  it('sends each friend only their own ticket, by WhatsApp and email, through a link that opens just that ticket', async () => {
    const res = await book({
      ticketDelivery: 'individual',
      attendeeContacts: [
        null, // the buyer's own ticket
        { whatsapp: '98765 22222', email: `Ravi-${suffix}@Example.com` },
        // Same contact as the buyer: their confirmation already covers it.
        { whatsapp: '+91 98765 11111', email: `asha-${suffix}@example.com` },
      ],
    });
    expect(res.status).toBe(201);
    const reference = res.body.bookingReference as string;
    const booking = (await Booking.findByPk(res.body.bookingId))!;
    expect(booking.ticketDelivery).toBe('individual');
    const tickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
    const ravi = tickets[1];
    expect(ravi.attendeeEmail).toBe(`ravi-${suffix}@example.com`);
    const raviToken = ticketLinkToken(reference, ravi.id);

    // WhatsApp: the buyer's usual confirmation, plus Ravi's own.
    const forRavi = () => sent.filter((b) => b.destination === '919876522222' && b.templateParams[7] === reference);
    await waitFor(() => forRavi().length > 0 && sent.some((b) => b.destination === '919876511111' && b.templateParams[7] === reference));
    const msg = forRavi()[0];
    expect(msg.campaignName).toBe('booking_confirmation_v3');
    expect(msg.userName).toBe('Ravi Kale');
    expect(msg.templateParams[0]).toBe('Ravi Kale');
    expect(msg.templateParams[2]).toBe('Asha Patil booked this ticket for you. Your ticket is ready.');
    expect(msg.templateParams[6]).toBe(`${reference.replace('-BKG-', '-TKT-')}-02`);
    expect(msg.media?.url).toBe(`https://events.test.example/api/t/${raviToken}/card.png`);
    expect(msg.buttons?.map((b) => b.parameters[0].text)).toEqual([raviToken, raviToken]);
    // Meera shares the buyer's number, so nothing extra went there.
    expect(sent.filter((b) => b.destination === '919876511111' && b.templateParams[7] === reference)).toHaveLength(1);

    // Email: the buyer's confirmation, plus one to Ravi with only his ticket.
    await waitFor(() => mockSendEmail.mock.calls.length >= 2);
    const recipients = mockSendEmail.mock.calls.map(([m]) => m.to).sort();
    expect(recipients).toEqual([`asha-${suffix}@example.com`, `ravi-${suffix}@example.com`].sort());
    const raviMail = mockSendEmail.mock.calls.find(([m]) => m.to === `ravi-${suffix}@example.com`)![0];
    expect(raviMail.subject).toContain('Your ticket:');
    expect(raviMail.html).toContain('Ravi Kale');
    expect(raviMail.html).toContain('Asha Patil booked this ticket for you');
    expect(raviMail.html).not.toContain('Meera Patil');
    expect(raviMail.html).toContain(raviToken);
    expect(raviMail.attachments?.some((a) => a.contentType === 'application/pdf')).toBe(false); // no invoice

    // Ravi's link opens his ticket only, without the buyer's details.
    const page = await request(app).get(`/api/t/${raviToken}`);
    expect(page.status).toBe(200);
    expect(page.body.scope).toBe('ticket');
    expect(page.body.bookedBy).toBe('Asha Patil');
    expect(page.body.tickets.map((t: { attendeeName: string }) => t.attendeeName)).toEqual(['Ravi Kale']);
    expect(page.body.tickets[0].displayReference).toBe(`${reference.replace('-BKG-', '-TKT-')}-02`);
    expect(page.body.primaryContactEmail).toBe('');
    expect(page.body.primaryContactWhatsapp).toBe('');
    expect(page.body.allowSelfServiceCancellation).toBe(false);
    expect((await request(app).get(`/api/t/${raviToken}/tickets/${ravi.id}/qr`)).status).toBe(200);
    expect((await request(app).get(`/api/t/${raviToken}/tickets/${tickets[0].id}/qr`)).status).toBe(404);
    const pdf = await request(app).get(`/api/t/${raviToken}/tickets.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);

    // A one-ticket link is not a booking link, and can't be pointed at another ticket.
    expect(verifyTicketLinkToken(raviToken)).toBeNull();
    const forged = `${reference}~${tickets[0].id}.${raviToken.split('.').pop()}`;
    expect((await request(app).get(`/api/t/${forged}`)).status).toBe(404);

    // The buyer's own link still shows all three.
    const buyerPage = await request(app).get(`/api/t/${ticketLinkToken(reference)}`);
    expect(buyerPage.body.scope).toBe('booking');
    expect(buyerPage.body.tickets).toHaveLength(3);
  });

  it('asks for every friend’s WhatsApp and email before holding any seats', async () => {
    const before = (await TicketCategory.findByPk(tierId))!.quotaRemaining;
    const res = await book({
      ticketDelivery: 'individual',
      attendeeContacts: [null, { whatsapp: '9876533333', email: `ravi2-${suffix}@example.com` }, { whatsapp: '123', email: 'x@y.z' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Enter a valid WhatsApp number for Meera Patil');
    const noEmail = await book({
      ticketDelivery: 'individual',
      attendeeContacts: [null, { whatsapp: '9876533333' }, { whatsapp: '9876544444', email: 'm@example.com' }],
    });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error).toBe('Enter a valid email address for Ravi Kale');
    expect((await TicketCategory.findByPk(tierId))!.quotaRemaining).toBe(before);
  });

  it('sends everything to the buyer by default, ignoring any friends’ contacts', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    const res = await book({ attendeeContacts: [null, { whatsapp: '9876555555', email: `nobody-${suffix}@example.com` }, null] });
    expect(res.status).toBe(201);
    const booking = (await Booking.findByPk(res.body.bookingId))!;
    expect(booking.ticketDelivery).toBe('buyer');
    const tickets = await Ticket.findAll({ where: { bookingId: booking.id } });
    expect(tickets.every((t) => t.attendeeWhatsapp === null && t.attendeeEmail === null)).toBe(true);
    await waitFor(() => mockSendEmail.mock.calls.length >= 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(mockSendEmail.mock.calls.map(([m]) => m.to)).toEqual([`asha-${suffix}@example.com`]);
    expect(sent.some((b) => b.destination === '919876555555')).toBe(false);
  });
});
