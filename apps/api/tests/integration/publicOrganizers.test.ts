import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory } from '../../src/models';
import { hashPassword } from '../../src/auth/password';

describe('public organizer directory (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let verifiedOrgId: string;
  let unverifiedOrgId: string;

  beforeAll(async () => {
    const verifiedOrg = await Organizer.create({
      name: `Verified Test Org ${suffix}`,
      slug: `verified-test-org-${suffix}`,
      about: 'A real, verified organizer',
    });
    verifiedOrgId = verifiedOrg.id;
    await User.create({
      organizerId: verifiedOrgId,
      email: `verified-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    await Event.create({
      organizerId: verifiedOrgId,
      name: 'Verified Org Event',
      slug: `verified-org-event-${suffix}`,
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'published',
      capacity: 10,
    });

    const unverifiedOrg = await Organizer.create({
      name: `Unverified Test Org ${suffix}`,
      slug: `unverified-test-org-${suffix}`,
    });
    unverifiedOrgId = unverifiedOrg.id;
    await User.create({
      organizerId: unverifiedOrgId,
      email: `unverified-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: false,
    });
  });

  afterAll(async () => {
    for (const orgId of [verifiedOrgId, unverifiedOrgId]) {
      const events = await Event.findAll({ where: { organizerId: orgId } });
      for (const event of events) {
        await TicketCategory.destroy({ where: { eventId: event.id } });
      }
      await Event.destroy({ where: { organizerId: orgId } });
      await User.destroy({ where: { organizerId: orgId } });
      await Organizer.destroy({ where: { id: orgId } });
    }
    await sequelize.close();
  });

  it('lists an organizer with a verified user, with a correct published-event count', async () => {
    const res = await request(app).get('/api/organizers');
    expect(res.status).toBe(200);
    const found = res.body.organizers.find((o: { slug: string }) => o.slug === `verified-test-org-${suffix}`);
    expect(found).toBeDefined();
    expect(found.name).toBe(`Verified Test Org ${suffix}`);
    expect(found.publishedEventCount).toBe(1);
  });

  it('does NOT list an organizer whose only user is unverified', async () => {
    const res = await request(app).get('/api/organizers');
    expect(res.status).toBe(200);
    const found = res.body.organizers.find((o: { slug: string }) => o.slug === `unverified-test-org-${suffix}`);
    expect(found).toBeUndefined();
  });

  it('a verified organizer\'s own profile page includes their real events', async () => {
    const res = await request(app).get(`/api/organizers/verified-test-org-${suffix}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Verified Test Org ${suffix}`);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].name).toBe('Verified Org Event');
  });

  it('an unverified organizer\'s profile 404s, same as one that does not exist at all', async () => {
    const res = await request(app).get(`/api/organizers/unverified-test-org-${suffix}`);
    expect(res.status).toBe(404);
  });
});
