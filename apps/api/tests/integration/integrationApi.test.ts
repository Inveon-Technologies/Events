import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, EventMedia, ApiCredential } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('Integrations: app key + secret and the /api/v1 read API (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let otherOrganizerId: string;
  let ownerToken: string;
  let staffToken: string;
  let publishedId: string;
  let draftId: string;
  let otherOrgEventId: string;

  beforeAll(async () => {
    process.env.API_PUBLIC_URL = 'https://events.test.example';
    const org = await Organizer.create({ name: `Integration Org ${suffix}`, slug: `integration-org-${suffix}`, about: 'We run treks' });
    const other = await Organizer.create({ name: `Other Integration Org ${suffix}`, slug: `other-integration-org-${suffix}` });
    organizerId = org.id;
    otherOrganizerId = other.id;
    const mk = async (role: 'organizer_owner' | 'organizer_staff') => {
      const u = await User.create({
        organizerId, email: `integration-${role}-${suffix}@example.com`,
        passwordHash: await hashPassword('TestPassword123'), role, emailVerified: true,
      });
      return signAccessToken({ sub: u.id, role, organizerId });
    };
    ownerToken = await mk('organizer_owner');
    staffToken = await mk('organizer_staff');

    const published = await Event.create({
      organizerId, name: 'Published Trek', slug: `published-trek-${suffix}`, eventDate: new Date(Date.now() + 10 * 86400000),
      capacity: 20, status: 'published', description: 'A real description',
    });
    await TicketCategory.create({ eventId: published.id, name: 'General', pricePaise: 49900, quotaTotal: 20, quotaRemaining: 17 });
    await EventMedia.create({ eventId: published.id, mediaType: 'photo', url: `/api/uploads/events/${published.id}/cover.jpg` });
    publishedId = published.id;
    const draft = await Event.create({ organizerId, name: 'Secret Draft', eventDate: new Date(Date.now() + 20 * 86400000), capacity: 5, status: 'draft' });
    draftId = draft.id;
    const otherEvent = await Event.create({ organizerId: otherOrganizerId, name: 'Not Yours', eventDate: new Date(Date.now() + 5 * 86400000), capacity: 5, status: 'published' });
    otherOrgEventId = otherEvent.id;
  });

  afterAll(async () => {
    const ids = [publishedId, draftId, otherOrgEventId];
    await EventMedia.destroy({ where: { eventId: ids } });
    await TicketCategory.destroy({ where: { eventId: ids } });
    await Event.destroy({ where: { id: ids } });
    await ApiCredential.destroy({ where: { organizerId: [organizerId, otherOrganizerId] } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: [organizerId, otherOrganizerId] } });
    await sequelize.close();
  });

  async function createKey(name = 'My website') {
    const res = await request(app).post('/api/organizer/integrations/keys').set('Authorization', `Bearer ${ownerToken}`).send({ name });
    expect(res.status).toBe(201);
    return res.body as { id: string; appKey: string; appSecret: string; secretLast4: string };
  }

  it('creates a key pair, shows the secret once, and lists the key without it', async () => {
    const key = await createKey();
    expect(key.appKey).toMatch(/^ievt_[0-9a-z]{24}$/);
    expect(key.appSecret).toMatch(/^isk_[0-9a-z]{40}$/);

    const list = await request(app).get('/api/organizer/integrations/keys').set('Authorization', `Bearer ${ownerToken}`);
    const listed = list.body.keys.find((k: { id: string }) => k.id === key.id);
    expect(listed).toMatchObject({ appKey: key.appKey, secretLast4: key.appSecret.slice(-4), name: 'My website' });
    expect(JSON.stringify(list.body)).not.toContain(key.appSecret);

    const stored = await ApiCredential.findByPk(key.id);
    expect(stored!.secretHash).not.toContain(key.appSecret);
  });

  it('only the owner can manage keys', async () => {
    const res = await request(app).post('/api/organizer/integrations/keys').set('Authorization', `Bearer ${staffToken}`).send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns the organizer\'s published events with absolute image URLs, via headers or Basic auth', async () => {
    const key = await createKey();

    const viaHeaders = await request(app).get('/api/v1/events').set('X-App-Key', key.appKey).set('X-App-Secret', key.appSecret);
    expect(viaHeaders.status).toBe(200);
    expect(viaHeaders.body.events.map((e: { id: string }) => e.id)).toEqual([publishedId]);
    expect(viaHeaders.body.events[0]).toMatchObject({
      name: 'Published Trek',
      status: 'published',
      minPricePaise: 49900,
      ticketsAvailable: 17,
      coverImageUrl: `https://events.test.example/api/uploads/events/${publishedId}/cover.jpg`,
    });
    expect(viaHeaders.headers['access-control-allow-origin']).toBe('*');

    const viaBasic = await request(app).get('/api/v1/organizer').auth(key.appKey, key.appSecret);
    expect(viaBasic.status).toBe(200);
    expect(viaBasic.body).toMatchObject({ id: organizerId, about: 'We run treks' });
  });

  it('returns full event detail by id or slug, drafts only when asked, never another organizer\'s events', async () => {
    const key = await createKey();
    const auth = (r: request.Test) => r.set('X-App-Key', key.appKey).set('X-App-Secret', key.appSecret);

    const bySlug = await auth(request(app).get(`/api/v1/events/published-trek-${suffix}`));
    expect(bySlug.status).toBe(200);
    expect(bySlug.body).toMatchObject({ id: publishedId, description: 'A real description' });
    expect(bySlug.body.ticketTiers).toEqual([expect.objectContaining({ name: 'General', pricePaise: 49900, available: 17, totalQuantity: 20 })]);
    expect(bySlug.body.images).toHaveLength(1);

    expect((await auth(request(app).get(`/api/v1/events/${draftId}`))).status).toBe(404);
    expect((await auth(request(app).get(`/api/v1/events/${draftId}?includeDrafts=true`))).status).toBe(200);
    expect((await auth(request(app).get(`/api/v1/events/${otherOrgEventId}`))).status).toBe(404);

    const withDrafts = await auth(request(app).get('/api/v1/events?includeDrafts=true'));
    expect(withDrafts.body.pagination.total).toBe(2);
  });

  it('rejects a missing, wrong, or revoked secret', async () => {
    const key = await createKey();
    expect((await request(app).get('/api/v1/events')).status).toBe(401);
    expect((await request(app).get('/api/v1/events').set('X-App-Key', key.appKey).set('X-App-Secret', 'isk_wrong')).status).toBe(401);

    const revoke = await request(app).delete(`/api/organizer/integrations/keys/${key.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(revoke.status).toBe(204);
    expect((await request(app).get('/api/v1/events').set('X-App-Key', key.appKey).set('X-App-Secret', key.appSecret)).status).toBe(401);
  });

  it('answers CORS preflight without credentials', async () => {
    const res = await request(app).options('/api/v1/events').set('Origin', 'https://my-site.example');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('X-App-Key');
  });
});
