import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { ticketLinkToken } from '../../src/services/ticketLinks';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { sendPostEventBroadcast } from '../../src/services/postEventBroadcast';
import { buildWhatsAppMessage } from '../../src/services/whatsapp/messages';
import { defaultCertificateDesign, sanitizeCertificateDesign, FOOTER_TOP_PERCENT } from '../../src/services/certificateDesign';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

// Participation certificates: organizer design + on/off, and downloads
// for checked-in attendees only.
describe('participation certificates', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let auth: string;
  let otherAuth: string;
  let otherOrganizerId: string;
  let eventId: string;
  let token: string;
  let reference: string;
  let tickets: Ticket[];

  beforeAll(async () => {
    process.env.WEB_PUBLIC_URL = 'https://events.test.example';
    const organizer = await Organizer.create({ name: `Cert Org ${suffix}`, slug: `cert-org-${suffix}`, cashfreeVendorStatus: 'active' });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `cert-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    auth = signAccessToken({ sub: user.id, role: user.role, organizerId });
    const other = await Organizer.create({
      name: `Other Cert Org ${suffix}`,
      slug: `other-cert-org-${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    otherOrganizerId = other.id;
    const otherUser = await User.create({
      organizerId: other.id,
      email: `cert-other-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherAuth = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: other.id });

    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        title: `Dandiya Night 2026 ${suffix}`,
        startDate: '2026-10-18',
        startTime: '19:00',
        venueName: 'Cultural Ground',
        city: 'Pandharpur',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    eventId = created.body.id;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const booking = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 2,
        attendeeNames: ['Rahul Sharma', 'Priya Sharma'],
        primaryContactName: 'Rahul Sharma',
        primaryContactWhatsapp: '9876543210',
        primaryContactEmail: `rahul-cert-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    reference = booking.body.bookingReference;
    token = ticketLinkToken(reference);
    tickets = await Ticket.findAll({ where: { bookingId: booking.body.bookingId }, order: [['createdAt', 'ASC']] });
  });

  afterAll(async () => {
    delete process.env.WEB_PUBLIC_URL;
    for (const orgId of [organizerId, otherOrganizerId]) {
      const events = await Event.findAll({ where: { organizerId: orgId } });
      for (const event of events) {
        const bookings = await Booking.findAll({ where: { eventId: event.id } });
        for (const b of bookings) {
          await Payment.destroy({ where: { bookingId: b.id } });
          await Ticket.destroy({ where: { bookingId: b.id } });
        }
        await Booking.destroy({ where: { eventId: event.id } });
        await TicketCategory.destroy({ where: { eventId: event.id } });
      }
      await Event.destroy({ where: { organizerId: orgId } });
      await User.destroy({ where: { organizerId: orgId } });
      await Organizer.destroy({ where: { id: orgId } });
    }
    await sequelize.close();
  });

  it('starts off, with the default layout, and only the owner can see or change it', async () => {
    const res = await request(app).get(`/api/organizer/events/${eventId}/certificate`).set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.design.fields.map((f: { id: string }) => f.id)).toEqual(
      expect.arrayContaining(['participant', 'title', 'event', 'date', 'certno']),
    );
    expect(res.body.fonts).toContain('Cinzel');

    const other = await request(app).get(`/api/organizer/events/${eventId}/certificate`).set('Authorization', `Bearer ${otherAuth}`);
    expect(other.status).toBe(403);
  });

  it('saves a customised design and renders a preview PNG', async () => {
    const design = defaultCertificateDesign();
    design.fields.find((f) => f.id === 'participant')!.fontFamily = 'Great Vibes';
    design.fields.push({
      id: 'custom1',
      kind: 'text',
      label: 'Custom',
      x: 10,
      y: 10,
      w: 30,
      h: 5,
      text: 'Held at {venue}',
      fontFamily: 'Inter',
      fontSize: 14,
      color: '#ff0000',
      bold: true,
      align: 'left',
      letterSpacing: 0,
      uppercase: false,
    });
    const saved = await request(app)
      .put(`/api/organizer/events/${eventId}/certificate`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ enabled: true, design });
    expect(saved.status).toBe(200);
    expect(saved.body.enabled).toBe(true);
    expect(saved.body.isDefault).toBe(false);
    expect(saved.body.design.fields.find((f: { id: string }) => f.id === 'custom1').text).toBe('Held at {venue}');

    const preview = await request(app)
      .post(`/api/organizer/events/${eventId}/certificate/preview`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ design, participant: 'Asha Patil' })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('image/png');
    expect((preview.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  }, 30000);

  it('rejects unsafe or invalid designs and keeps fields above the fixed footer', async () => {
    const bad = await request(app)
      .put(`/api/organizer/events/${eventId}/certificate`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ design: { backgroundUrl: 'javascript:alert(1)', fields: [] } });
    expect(bad.status).toBe(400);

    const clean = sanitizeCertificateDesign({
      backgroundUrl: null,
      fields: [{ id: 'x', kind: 'text', x: 500, y: 95, w: 30, h: 5, fontFamily: 'Comic Sans', color: 'red', text: 'Hi' }],
    });
    const f = clean.fields[0];
    expect(f.x + f.w).toBeLessThanOrEqual(100);
    expect(f.y + f.h).toBeLessThanOrEqual(FOOTER_TOP_PERCENT);
    expect(f.fontFamily).toBe('Montserrat');
    expect(f.color).toBe('#1f2937');
  });

  it('gives a certificate only to checked-in attendees', async () => {
    const before = await request(app).get(`/api/certificates/${token}`);
    expect(before.status).toBe(404);
    expect(before.body.error).toMatch(/checked in/);

    await tickets[0].update({ status: 'checked_in', checkedInAt: new Date() });

    const detail = await request(app).get(`/api/t/${token}`);
    expect(detail.body.tickets.map((t: { certificateAvailable: boolean }) => t.certificateAvailable)).toEqual([true, false]);

    // Manage Booking (booking ID + email) gets ready-made download links.
    const manage = await request(app).get(`/api/bookings/${reference}/tickets?email=rahul-cert-${suffix}@example.com`);
    expect(manage.status).toBe(200);
    expect(manage.body.certificatesEnabled).toBe(true);
    expect(manage.body.certificatesUrl).toBe(`/api/certificates/${token}`);
    expect(manage.body.tickets.map((t: { certificateUrl: string | null }) => t.certificateUrl)).toEqual([
      `/api/t/${token}/tickets/${tickets[0].id}/certificate.pdf`,
      null,
    ]);

    const one = await request(app).get(`/api/t/${token}/tickets/${tickets[0].id}/certificate.pdf`).buffer(true);
    expect(one.status).toBe(200);
    expect(one.headers['content-type']).toBe('application/pdf');
    expect(one.body.subarray(0, 5).toString()).toBe('%PDF-');

    const notCheckedIn = await request(app).get(`/api/t/${token}/tickets/${tickets[1].id}/certificate.pdf`);
    expect(notCheckedIn.status).toBe(404);

    const tampered = await request(app).get(`/api/certificates/${reference}.bad`);
    expect(tampered.status).toBe(404);
  }, 30000);

  it('attaches the certificate to the post-event email and builds the WhatsApp certificate message', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockClear();
    await request(app).put(`/api/organizer/events/${eventId}/certificate`).set('Authorization', `Bearer ${auth}`).send({ enabled: true });
    const event = (await Event.findByPk(eventId))!;
    await event.update({ eventDate: new Date(Date.now() - 36 * 60 * 60 * 1000), postEventEmailSentAt: null });

    const result = await sendPostEventBroadcast(event);
    expect(result.emailsSent).toBe(1);
    const call = mockSendEmail.mock.calls.find((c) => c[0].to === `rahul-cert-${suffix}@example.com`)!;
    expect(call[0].subject).toContain('Your certificate from');
    expect(call[0].html).toContain('certificate of participation is attached');
    const pdf = call[0].attachments!.find((a) => a.filename === `Certificate-${reference}.pdf`)!;
    expect(pdf.content.subarray(0, 5).toString()).toBe('%PDF-');

    const booking = (await Booking.findOne({ where: { bookingReference: reference } }))!;
    const built = await buildWhatsAppMessage('certificateReady', booking, event);
    expect(built!.params).toEqual(['Rahul Sharma', event.name]);
    expect(built!.urlButtons).toEqual([token]);
    mockIsEmailConfigured.mockReturnValue(false);
  }, 30000);

  it('issues none when the organizer switches certificates off', async () => {
    await request(app).put(`/api/organizer/events/${eventId}/certificate`).set('Authorization', `Bearer ${auth}`).send({ enabled: false });
    const res = await request(app).get(`/api/certificates/${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/does not issue certificates/);
  });
});
