import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import request from 'supertest';
import { createCanvas } from '@napi-rs/canvas';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket, EventMedia } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { ticketLinkToken } from '../../src/services/ticketLinks';
import { isAcceptableImageUrl, localUploadPath } from '../../src/services/designAssets';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

// Organizer-chosen ticket design: title background + up to 10 partners.
describe('event ticket design (background + partners)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let auth: string;
  let pngPath: string;
  const eventBody = (extra: Record<string, unknown> = {}) => ({
    title: `Design Trek ${suffix}`,
    startDate: '2026-12-25',
    startTime: '06:30',
    venueName: 'Rajgad',
    city: 'Pune',
    ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
    status: 'published',
    ...extra,
  });

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Design Org ${suffix}`,
      slug: `design-org-${suffix}`,
      logoUrl: '/api/uploads/organizers/x/logo.png',
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `design-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    auth = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const canvas = createCanvas(40, 20);
    canvas.getContext('2d').fillRect(0, 0, 40, 20);
    pngPath = path.join(os.tmpdir(), `design-${suffix}.png`);
    await fs.writeFile(pngPath, await canvas.encode('png'));
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
      await EventMedia.destroy({ where: { eventId: event.id } });
      await TicketCategory.destroy({ where: { eventId: event.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await fs.unlink(pngPath).catch(() => undefined);
    await sequelize.close();
  });

  it('uploads a design image and rejects a file that is not an image', async () => {
    const res = await request(app).post('/api/organizer/uploads/image').set('Authorization', `Bearer ${auth}`).attach('file', pngPath);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(new RegExp(`^/api/uploads/organizers/${organizerId}/design/.+\\.png$`));
    await expect(fs.stat(localUploadPath(res.body.url)!)).resolves.toBeTruthy();

    const bad = await request(app)
      .post('/api/organizer/uploads/image')
      .set('Authorization', `Bearer ${auth}`)
      .attach('file', Buffer.from('<svg/>'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);

    const anon = await request(app).post('/api/organizer/uploads/image').attach('file', pngPath);
    expect(anon.status).toBe(401);
  });

  it('saves the background and partners, and shows them on the ticket', async () => {
    const upload = await request(app).post('/api/organizer/uploads/image').set('Authorization', `Bearer ${auth}`).attach('file', pngPath);
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send(
        eventBody({
          ticketBackgroundUrl: upload.body.url,
          partners: [
            { name: 'Sahyadri Outdoors', role: 'Title Sponsor', logoUrl: upload.body.url },
            { name: 'Radio Pune', role: 'Media Partner', logoUrl: 'https://cdn.example.com/radio.png' },
            { name: '', role: '', logoUrl: '' }, // empty row left in the form
          ],
        }),
      );
    expect(created.status).toBe(201);
    const eventId = created.body.id as string;

    const detail = await request(app).get(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${auth}`);
    expect(detail.body.ticketBackgroundUrl).toBe(upload.body.url);
    expect(detail.body.partners).toEqual([
      { name: 'Sahyadri Outdoors', role: 'Title Sponsor', logoUrl: upload.body.url },
      { name: 'Radio Pune', role: 'Media Partner', logoUrl: 'https://cdn.example.com/radio.png' },
    ]);

    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const booking = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 1,
        primaryContactName: 'Rahul',
        primaryContactWhatsapp: '9876543210',
        primaryContactEmail: `rahul-design-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    const ticket = await request(app).get(`/api/t/${ticketLinkToken(booking.body.bookingReference)}`);
    expect(ticket.status).toBe(200);
    expect(ticket.body.ticketBackgroundUrl).toBe(upload.body.url);
    expect(ticket.body.partners).toHaveLength(2);
    expect(ticket.body.organizerLogoUrl).toBe('/api/uploads/organizers/x/logo.png');
    expect(ticket.body.tickets[0].displayReference).toBe(`${booking.body.bookingReference.replace('-BKG-', '-TKT-')}-01`);

    // Clearing on update.
    const cleared = await request(app)
      .patch(`/api/organizer/events/${eventId}`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ ticketBackgroundUrl: null, partners: [] });
    expect(cleared.status).toBe(200);
    const after = await Event.findByPk(eventId);
    expect(after!.ticketBackgroundUrl).toBeNull();
    expect(after!.partners).toBeNull();
  });

  it('falls back to the event cover photo when no background was uploaded', async () => {
    const created = await request(app).post('/api/organizer/events').set('Authorization', `Bearer ${auth}`).send(eventBody());
    const eventId = created.body.id as string;
    await EventMedia.create({ eventId, mediaType: 'photo', url: '/api/uploads/events/cover.jpg' });
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    const booking = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 1,
        primaryContactName: 'Asha',
        primaryContactWhatsapp: '9876543211',
        primaryContactEmail: `asha-design-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    const ticket = await request(app).get(`/api/t/${ticketLinkToken(booking.body.bookingReference)}`);
    expect(ticket.body.ticketBackgroundUrl).toBe('/api/uploads/events/cover.jpg');
    expect(ticket.body.bannerUrl).toBe('/api/uploads/events/cover.jpg');
    expect(ticket.body.partners).toEqual([]);
  });

  it('rejects more than 10 partners and logos that are not uploaded or https images', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `Partner ${i + 1}` }));
    const tooMany = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send(eventBody({ partners: eleven }));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toMatch(/up to 10 partners/);

    const badLogo = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send(eventBody({ partners: [{ name: 'X', logoUrl: 'javascript:alert(1)' }] }));
    expect(badLogo.status).toBe(400);

    const badBackground = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${auth}`)
      .send(eventBody({ ticketBackgroundUrl: 'http://insecure.example/bg.jpg' }));
    expect(badBackground.status).toBe(400);
  });

  it('only accepts own uploads (no path escapes) or https URLs', () => {
    expect(isAcceptableImageUrl('/api/uploads/organizers/a/design/b.png')).toBe(true);
    expect(isAcceptableImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isAcceptableImageUrl('/api/uploads/../../etc/passwd')).toBe(false);
    expect(isAcceptableImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isAcceptableImageUrl('/etc/passwd')).toBe(false);
    expect(localUploadPath('/api/uploads/../secret')).toBeNull();
  });
});
