import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real event gender restriction (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Gender Restriction Test Org ${suffix}`,
      slug: `gender-restriction-test-org-${suffix}`,
      cashfreeVendorId: `gender_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `gender-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
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

  async function createEvent(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Gender Restriction Event ${suffix}-${Math.random()}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
        ...overrides,
      });
    const eventId = res.body.id as string;
    const tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
    return { eventId, slug: res.body.slug as string, tierId };
  }

  it('creates a real event with a real gender restriction, exposed on both the organizer and public APIs', async () => {
    const { eventId, slug } = await createEvent({ genderRestriction: 'female' });

    const organizerDetail = await request(app).get(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(organizerDetail.body.genderRestriction).toBe('female');

    const publicDetail = await request(app).get(`/api/events/${slug}`);
    expect(publicDetail.body.genderRestriction).toBe('female');
  });

  it('an event with no restriction set is genuinely null everywhere — the real default, open to all genders', async () => {
    const { eventId, slug } = await createEvent();

    const organizerDetail = await request(app).get(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(organizerDetail.body.genderRestriction).toBeNull();

    const publicDetail = await request(app).get(`/api/events/${slug}`);
    expect(publicDetail.body.genderRestriction).toBeNull();
  });

  it('rejects a real booking on a restricted event with no genders provided at all', async () => {
    const { eventId, tierId } = await createEvent({ genderRestriction: 'female' });
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 1, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000001', primaryContactEmail: `no-gender-${suffix}@example.com`, paymentMethod: 'cash',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/female attendees only/i);
  });

  it('rejects a real booking with a mismatched gender for a restricted event', async () => {
    const { eventId, tierId } = await createEvent({ genderRestriction: 'female' });
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 1, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000002', primaryContactEmail: `wrong-gender-${suffix}@example.com`, paymentMethod: 'cash',
      attendeeGenders: ['male'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/female attendees only/i);
  });

  it('rejects the whole booking if even one of several attendees has a mismatched gender', async () => {
    const { eventId, tierId } = await createEvent({ genderRestriction: 'male' });
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 3, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000003', primaryContactEmail: `mixed-gender-${suffix}@example.com`, paymentMethod: 'cash',
      attendeeGenders: ['male', 'male', 'female'],
    });
    expect(res.status).toBe(400);
  });

  it('a rejected gender-restriction booking never reserves real quota', async () => {
    const { eventId, tierId } = await createEvent({ genderRestriction: 'female' });
    const before = await TicketCategory.findByPk(tierId);

    await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 2, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000004', primaryContactEmail: `no-reserve-${suffix}@example.com`, paymentMethod: 'cash',
    });

    const after = await TicketCategory.findByPk(tierId);
    expect(after!.quotaRemaining).toBe(before!.quotaRemaining);
  });

  it('a real booking with every attendee\'s gender genuinely matching succeeds and stores each real gender on its ticket', async () => {
    const { eventId, tierId } = await createEvent({ genderRestriction: 'female' });
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 2, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000005', primaryContactEmail: `matching-gender-${suffix}@example.com`, paymentMethod: 'cash',
      attendeeGenders: ['female', 'female'],
      attendeeNames: ['Attendee One', 'Attendee Two'],
    });
    expect(res.status).toBe(201);

    const tickets = await Ticket.findAll({ where: { bookingId: res.body.bookingId }, order: [['createdAt', 'ASC']] });
    expect(tickets.map((t) => t.attendeeGender)).toEqual(['female', 'female']);
  });

  it('a booking on an unrestricted event succeeds with no gender provided at all — never asked, never checked', async () => {
    const { eventId, tierId } = await createEvent();
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId, quantity: 1, primaryContactName: 'Test Customer',
      primaryContactWhatsapp: '+919000000006', primaryContactEmail: `unrestricted-${suffix}@example.com`, paymentMethod: 'cash',
    });
    expect(res.status).toBe(201);
    const tickets = await Ticket.findAll({ where: { bookingId: res.body.bookingId } });
    expect(tickets[0].attendeeGender).toBeNull();
  });

  it('editing an existing event can set, change, and clear the real gender restriction', async () => {
    const { eventId } = await createEvent();

    await request(app).patch(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`).send({ genderRestriction: 'male' });
    let detail = await request(app).get(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.genderRestriction).toBe('male');

    await request(app).patch(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`).send({ genderRestriction: null });
    detail = await request(app).get(`/api/organizer/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.genderRestriction).toBeNull();
  });

  it('duplicating an event carries over its real gender restriction', async () => {
    const { eventId } = await createEvent({ genderRestriction: 'female' });
    const res = await request(app).post(`/api/organizer/events/${eventId}/duplicate`).set('Authorization', `Bearer ${token}`);
    const detail = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.genderRestriction).toBe('female');
  });
});
