import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { ticketLinkToken, verifyTicketLinkToken } from '../../src/services/ticketLinks';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

// The ticket page behind the signed link sent on WhatsApp and email.
describe('ticket link (/api/t/:token)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let reference: string;
  let otherReference: string;
  let token: string;

  beforeAll(async () => {
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    const organizer = await Organizer.create({
      name: `Ticket Link Org ${suffix}`,
      slug: `ticket-link-org-${suffix}`,
      contactPhone: '07887503856',
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `ticket-link-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const auth = signAccessToken({ sub: user.id, role: user.role, organizerId });
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        title: `Link Trek ${suffix}`,
        startDate: '2026-12-25',
        startTime: '05:30',
        venueName: 'Rajgad',
        city: 'Pune',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    const eventId = created.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const book = (name: string) =>
      request(app)
        .post(`/api/events/${eventId}/bookings`)
        .send({
          ticketCategoryId: tierId,
          quantity: 2,
          attendeeNames: [name, `${name} Friend`],
          primaryContactName: name,
          primaryContactWhatsapp: '9876543210',
          primaryContactEmail: `${name.toLowerCase()}-${suffix}@example.com`,
          paymentMethod: 'cash',
        });
    reference = (await book('Rahul')).body.bookingReference;
    otherReference = (await book('Other')).body.bookingReference;
    token = ticketLinkToken(reference);
  });

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

  it('only accepts genuine tokens', () => {
    expect(verifyTicketLinkToken(token)).toBe(reference);
    expect(verifyTicketLinkToken(`${reference}.AAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    expect(verifyTicketLinkToken(`${otherReference}.${token.split('.').pop()}`)).toBeNull();
    expect(verifyTicketLinkToken('garbage')).toBeNull();
  });

  it('returns the booking and its tickets for a valid link, 404 for a tampered one', async () => {
    const res = await request(app).get(`/api/t/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.bookingReference).toBe(reference);
    expect(res.body.tickets.map((t: { attendeeName: string }) => t.attendeeName)).toEqual(['Rahul', 'Rahul Friend']);
    expect(res.body.ticketPageUrl).toBe(`https://events.test.example/t/${token}`);
    expect(res.body.organizerContactPhone).toBe('07887503856');
    // Neither channel is configured in this test.
    expect(res.body.delivery).toEqual({ email: 'skipped', whatsapp: 'skipped' });

    expect((await request(app).get(`/api/t/${reference}.nope`)).status).toBe(404);
    expect((await request(app).get(`/api/t/${otherReference}.${token.split('.').pop()}`)).status).toBe(404);
  });

  it("serves each ticket QR, but never another booking's", async () => {
    const detail = (await request(app).get(`/api/t/${token}`)).body;
    const qr = await request(app).get(`/api/t/${token}/tickets/${detail.tickets[1].id}/qr`);
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toBe('image/png');

    const other = (await request(app).get(`/api/t/${ticketLinkToken(otherReference)}`)).body;
    expect((await request(app).get(`/api/t/${token}/tickets/${other.tickets[0].id}/qr`)).status).toBe(404);
  });

  it('downloads the ticket PDF (one page per participant) and the card image', async () => {
    const pdf = await request(app)
      .get(`/api/t/${token}/tickets.pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const body = pdf.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(body.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);

    const card = await request(app)
      .get(`/api/t/${token}/card.png`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(card.status).toBe(200);
    expect((card.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  }, 20000);
});
