import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { deliverBookingConfirmationEmail, buildBookingEmailPayload } from '../../src/services/bookingEmails';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

// The designed confirmation email + invoice, built from a real booking.
describe('booking confirmation email (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let bookingId: string;
  let reference: string;

  beforeAll(async () => {
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    const organizer = await Organizer.create({
      name: `Email Org ${suffix}`,
      slug: `email-org-${suffix}`,
      contactPhone: '0788 750 3856',
      gstNumber: '27AABCE1234F1Z5',
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `email-org-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const auth = signAccessToken({ sub: user.id, role: user.role, organizerId });
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        title: `Dandiya Night 2026 ${suffix}`,
        shortDescription: 'An Evening of Music • Dance • Celebration',
        startDate: '2026-10-18',
        startTime: '19:00',
        venueName: 'Cultural Ground',
        city: 'Pandharpur',
        state: 'Maharashtra',
        ticketTiers: [{ name: 'General Entry', price: 0, quantity: 20 }],
        status: 'published',
        partners: [{ name: 'EPC Sound', role: 'Music Partner', logoUrl: null }],
      });
    const eventId = created.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const booking = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 2,
        attendeeNames: ['Rahul Sharma', 'Priya Sharma'],
        primaryContactName: 'Rahul Sharma',
        primaryContactWhatsapp: '9876543210',
        primaryContactEmail: `rahul-email-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    bookingId = booking.body.bookingId;
    reference = booking.body.bookingReference;
  });

  afterAll(async () => {
    delete process.env.WEB_PUBLIC_URL;
    const events = await Event.findAll({ where: { organizerId } });
    for (const event of events) {
      const bookings = await Booking.findAll({ where: { eventId: event.id } });
      for (const b of bookings) {
        await Payment.destroy({ where: { bookingId: b.id } });
        await Ticket.destroy({ where: { bookingId: b.id } });
      }
      await Booking.destroy({ where: { eventId: event.id } });
      await TicketCategory.destroy({ where: { eventId: event.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('sends the designed email with the banner, one QR per attendee, partners, links and the invoice', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockClear();
    const payload = await buildBookingEmailPayload(bookingId);
    await deliverBookingConfirmationEmail(payload!);

    const call = mockSendEmail.mock.calls.find((c) => c[0].subject.includes(reference));
    expect(call).toBeTruthy();
    const { html, attachments = [], to } = call![0];
    expect(to).toBe(`rahul-email-${suffix}@example.com`);
    expect(html).toContain('BOOKING CONFIRMED');
    expect(html).toContain('Rahul Sharma');
    expect(html).toContain('Priya Sharma');
    expect(html).toContain(`${reference.replace('-BKG-', '-TKT-')}-02`);
    expect(html).toContain('07:00 PM');
    expect(html).toContain('OUR EVENT PARTNERS');
    expect(html).toContain('EPC Sound');
    expect(html).toContain(`https://events.test.example/t/${reference}.`);

    const cids = attachments.filter((a) => a.cid).map((a) => a.cid);
    expect(cids).toEqual(expect.arrayContaining(['event-header', 'ticket-qr-1', 'ticket-qr-2']));
    for (const cid of cids) expect(html).toContain(`cid:${cid}`);
    const header = attachments.find((a) => a.cid === 'event-header')!;
    expect(header.content.subarray(1, 4).toString()).toBe('PNG');

    const invoice = attachments.find((a) => a.filename === `Invoice-${reference.replace('INV-BKG-', 'INV-')}.pdf`);
    expect(invoice).toBeTruthy();
    expect(invoice!.content.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
