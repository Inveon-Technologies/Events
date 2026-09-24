import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('post-event photos & videos link (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let otherOrganizerId: string;
  let token: string;
  let otherToken: string;

  async function createEvent(daysAhead: number) {
    const event = await Event.create({
      organizerId,
      name: `Gallery Event ${suffix}-${Math.random()}`,
      eventDate: new Date(Date.now() + 30 * 86400000),
      capacity: 10,
      status: 'published',
    });
    const tier = await TicketCategory.create({ eventId: event.id, name: 'General', pricePaise: 0, quotaTotal: 10, quotaRemaining: 10 });
    const booking = await request(app).post(`/api/events/${event.id}/bookings`).send({
      ticketCategoryId: tier.id, quantity: 1, primaryContactName: 'Gallery Guest',
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: `gallery-${suffix}@example.com`, paymentMethod: 'cash',
    });
    await event.update({ eventDate: new Date(Date.now() + daysAhead * 86400000) });
    return { event, bookingReference: booking.body.bookingReference as string, bookingId: booking.body.bookingId as string };
  }

  beforeAll(async () => {
    const mk = async (label: string) => {
      const org = await Organizer.create({ name: `Gallery Org ${label} ${suffix}`, slug: `gallery-org-${label}-${suffix}` });
      const user = await User.create({
        organizerId: org.id, email: `gallery-${label}-${suffix}@example.com`,
        passwordHash: await hashPassword('TestPassword123'), role: 'organizer_owner', emailVerified: true,
      });
      return { id: org.id, token: signAccessToken({ sub: user.id, role: 'organizer_owner', organizerId: org.id }) };
    };
    const a = await mk('a');
    const b = await mk('b');
    organizerId = a.id; token = a.token; otherOrganizerId = b.id; otherToken = b.token;
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    const bookings = await Booking.findAll({ where: { eventId: events.map((e) => e.id) } });
    const bookingIds = bookings.map((b) => b.id);
    await Payment.destroy({ where: { bookingId: bookingIds } });
    await Ticket.destroy({ where: { bookingId: bookingIds } });
    await Booking.destroy({ where: { id: bookingIds } });
    await TicketCategory.destroy({ where: { eventId: events.map((e) => e.id) } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId: [organizerId, otherOrganizerId] } });
    await Organizer.destroy({ where: { id: [organizerId, otherOrganizerId] } });
    await sequelize.close();
  });

  it('lets the organizer add a Google Drive link after the event, and attendees see it on their booking', async () => {
    const { event, bookingReference, bookingId } = await createEvent(-1);
    await Booking.update({ status: 'confirmed' }, { where: { id: bookingId } });

    const res = await request(app)
      .put(`/api/organizer/events/${event.id}/gallery`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://drive.google.com/drive/folders/abc123', note: 'All photos from the summit!' });
    expect(res.status).toBe(200);
    expect(res.body.galleryUrl).toBe('https://drive.google.com/drive/folders/abc123');

    const detail = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: `gallery-${suffix}@example.com` });
    expect(detail.body.galleryUrl).toBe('https://drive.google.com/drive/folders/abc123');
    expect(detail.body.galleryNote).toBe('All photos from the summit!');

    const orgDetail = await request(app).get(`/api/organizer/events/${event.id}`).set('Authorization', `Bearer ${token}`);
    expect(orgDetail.body.galleryUrl).toBe('https://drive.google.com/drive/folders/abc123');

    // Clearing removes it everywhere.
    await request(app).put(`/api/organizer/events/${event.id}/gallery`).set('Authorization', `Bearer ${token}`).send({ url: '' });
    const cleared = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: `gallery-${suffix}@example.com` });
    expect(cleared.body.galleryUrl).toBeNull();
  });

  it('refuses a link before the event has happened', async () => {
    const { event } = await createEvent(5);
    const res = await request(app)
      .put(`/api/organizer/events/${event.id}/gallery`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://drive.google.com/drive/folders/abc123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/once the event has taken place/i);
  });

  it.each([
    ['http://drive.google.com/x', /https/],
    ['https://evil.example/drive.google.com', /Google Drive or Google Photos/],
    ['not a url', /full link/],
  ])('rejects %s', async (url, message) => {
    const { event } = await createEvent(-1);
    const res = await request(app).put(`/api/organizer/events/${event.id}/gallery`).set('Authorization', `Bearer ${token}`).send({ url });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it('never shows the link on a cancelled booking, and another organizer cannot set it', async () => {
    const { event, bookingReference, bookingId } = await createEvent(-1);
    await Booking.update({ status: 'cancelled' }, { where: { id: bookingId } });
    await request(app).put(`/api/organizer/events/${event.id}/gallery`).set('Authorization', `Bearer ${token}`).send({ url: 'https://photos.app.goo.gl/xyz' });
    const detail = await request(app).get(`/api/bookings/${bookingReference}/tickets`).query({ email: `gallery-${suffix}@example.com` });
    expect(detail.body.galleryUrl).toBeNull();

    const other = await request(app).put(`/api/organizer/events/${event.id}/gallery`).set('Authorization', `Bearer ${otherToken}`).send({ url: 'https://drive.google.com/x' });
    expect(other.status).toBe(403);
  });
});
