import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

// Organizers enter India time; the server runs in UTC. The start time must
// be stored as that India-time instant, and read back the same way.
describe('event start time is India time', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({ name: `TZ Org ${suffix}`, slug: `tz-org-${suffix}` });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `tz-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    await TicketCategory.destroy({ where: { eventId: events.map((e) => e.id) } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('stores 06:30 as 06:30 IST (01:00 UTC), and keeps it when only the date is edited', async () => {
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `TZ Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '06:30',
        ticketTiers: [{ name: 'General', price: 0, quantity: 5 }],
      });
    expect(created.status).toBe(201);
    let event = (await Event.findByPk(created.body.id))!;
    expect(event.eventDate.toISOString()).toBe('2026-12-25T01:00:00.000Z');

    const moved = await request(app)
      .patch(`/api/organizer/events/${event.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2026-12-26' });
    expect(moved.status).toBe(200);
    event = (await Event.findByPk(event.id))!;
    expect(event.eventDate.toISOString()).toBe('2026-12-26T01:00:00.000Z');

    // A late-evening IST start that falls on the previous UTC day.
    await request(app).patch(`/api/organizer/events/${event.id}`).set('Authorization', `Bearer ${token}`).send({ startTime: '02:00' });
    event = (await Event.findByPk(event.id))!;
    expect(event.eventDate.toISOString()).toBe('2026-12-25T20:30:00.000Z');
  });
});
