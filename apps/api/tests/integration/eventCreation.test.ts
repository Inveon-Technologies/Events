import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('organizer event creation (real DB)', () => {
  const app = createApp();
  let organizerId: string;
  let token: string;
  const testEmail = `event-creation-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Event Creation Test Org ${Date.now()}`,
      slug: `event-creation-test-${Date.now()}`,
      // This suite publishes paid events, which createOrganizerEvent()
      // now refuses unless the organizer has an active Cashfree vendor
      // (see eventCreation.ts's publish-time verification gate) — most
      // of these tests are about event creation itself, not that gate
      // specifically, so they need a verified fixture to actually reach
      // what they're testing.
      cashfreeVendorId: `event_creation_test_vendor_${Date.now()}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: testEmail,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    for (const event of events) {
      await TicketCategory.destroy({ where: { eventId: event.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { email: testEmail } });
    await Organizer.destroy({ where: { id: organizerId } });
    // No sequelize.close() here — this file has a second describe block
    // below that still needs the connection open; only the last block
    // in the file closes it. Jest runs each describe block's
    // beforeAll/tests/afterAll fully before the next one starts, so
    // closing the connection here would break every test after this
    // point in the same file (found live: exactly that failure, before
    // this fix).
  });

  it('creates a real event with real ticket categories, correctly priced in paise', async () => {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Integration Test Event',
        shortDescription: 'A short description',
        description: 'A long description',
        startDate: '2026-12-01',
        startTime: '10:00',
        venueName: 'Test Venue',
        city: 'Pune',
        ticketTiers: [
          { name: 'General', price: 500, quantity: 100 },
          { name: 'VIP', price: 1500, quantity: 20 },
        ],
        status: 'published',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.slug).toBe(`integration-test-event-${new Date().getFullYear()}`);

    const event = await Event.findByPk(res.body.id);
    expect(event).not.toBeNull();
    expect(event!.name).toBe('Integration Test Event');
    expect(event!.slug).toBe(res.body.slug);
    expect(event!.status).toBe('published');
    expect(event!.capacity).toBe(120); // 100 + 20

    const tiers = await TicketCategory.findAll({ where: { eventId: res.body.id }, order: [['pricePaise', 'ASC']] });
    expect(tiers).toHaveLength(2);
    expect(tiers[0].name).toBe('General');
    expect(tiers[0].pricePaise).toBe(50000); // 500 rupees -> paise
    expect(tiers[0].quotaTotal).toBe(100);
    expect(tiers[0].quotaRemaining).toBe(100);
    expect(tiers[1].pricePaise).toBe(150000);
  });

  it('a published event immediately appears in the real public events list, and is fetchable by its own slug', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Publicly Visible Test Event',
        startDate: '2026-12-05',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 200, quantity: 10 }],
        status: 'published',
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/events');
    const names = listRes.body.events.map((e: { name: string }) => e.name);
    expect(names).toContain('Publicly Visible Test Event');

    const detailRes = await request(app).get(`/api/events/${createRes.body.slug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.name).toBe('Publicly Visible Test Event');
  });

  it('a draft event does NOT appear in the public list', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Draft Test Event',
        startDate: '2026-12-05',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 200, quantity: 10 }],
        status: 'draft',
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/events');
    const names = listRes.body.events.map((e: { name: string }) => e.name);
    expect(names).not.toContain('Draft Test Event');
  });

  it('rejects a missing title and missing ticket tiers with clear errors', async () => {
    const noTitle = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', startDate: '2026-12-01', startTime: '10:00', ticketTiers: [{ name: 'A', price: 1, quantity: 1 }] });
    expect(noTitle.status).toBe(400);

    const noTiers = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Has A Title', startDate: '2026-12-01', startTime: '10:00', ticketTiers: [] });
    expect(noTiers.status).toBe(400);
  });

  it('rejects the request entirely without a real auth token', async () => {
    const res = await request(app).post('/api/organizer/events').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('stores schedule, packing checklist, and FAQ items, sanitizing out incomplete entries', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Rich Content Test Event',
        startDate: '2026-12-10',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
        scheduleItems: [
          { time: '06:00 AM', title: 'Assembly', description: 'Meet at base camp' },
          { time: '07:00 AM', title: 'Trek begins' },
          { time: '', title: 'Should be dropped (no time)' },
        ],
        packingChecklist: [
          { item: 'Trekking shoes', mandatory: true },
          { item: 'Sunscreen', mandatory: false },
          { item: '', mandatory: true },
        ],
        faqItems: [
          { question: 'Is food included?', answer: 'Yes, breakfast and lunch.' },
          { question: 'No answer here', answer: '' },
        ],
      });
    expect(createRes.status).toBe(201);

    const detailRes = await request(app).get(`/api/events/${createRes.body.slug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.scheduleItems).toEqual([
      { time: '06:00 AM', title: 'Assembly', description: 'Meet at base camp' },
      { time: '07:00 AM', title: 'Trek begins' },
    ]);
    expect(detailRes.body.packingChecklist).toEqual([
      { item: 'Trekking shoes', mandatory: true },
      { item: 'Sunscreen', mandatory: false },
    ]);
    expect(detailRes.body.faqItems).toEqual([{ question: 'Is food included?', answer: 'Yes, breakfast and lunch.' }]);
  });

  it('an event with no rich content returns null for each field, not an error or empty array', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'No Rich Content Event',
        startDate: '2026-12-12',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    expect(createRes.status).toBe(201);

    const detailRes = await request(app).get(`/api/events/${createRes.body.slug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.scheduleItems).toBeNull();
    expect(detailRes.body.packingChecklist).toBeNull();
    expect(detailRes.body.faqItems).toBeNull();
  });
});

describe('organizer event creation: publish-time Cashfree verification gate', () => {
  const app = createApp();
  let unverifiedToken: string;
  let verifiedToken: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const unverifiedOrg = await Organizer.create({
      name: `Publish Gate Unverified Org ${suffix}`,
      slug: `publish-gate-unverified-${suffix}`,
    });
    const unverifiedUser = await User.create({
      organizerId: unverifiedOrg.id,
      email: `publish-gate-unverified-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    unverifiedToken = signAccessToken({ sub: unverifiedUser.id, role: unverifiedUser.role, organizerId: unverifiedOrg.id });

    const verifiedOrg = await Organizer.create({
      name: `Publish Gate Verified Org ${suffix}`,
      slug: `publish-gate-verified-${suffix}`,
      cashfreeVendorId: `publish_gate_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    const verifiedUser = await User.create({
      organizerId: verifiedOrg.id,
      email: `publish-gate-verified-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    verifiedToken = signAccessToken({ sub: verifiedUser.id, role: verifiedUser.role, organizerId: verifiedOrg.id });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('refuses to publish an event with a paid ticket tier when the organizer is not verified', async () => {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({
        title: 'Should Be Blocked Paid Event',
        startDate: '2026-12-12',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/verification/i);
  });

  it('still allows saving a paid event as a DRAFT when the organizer is not verified', async () => {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({
        title: 'Draft Paid Event Should Be Allowed',
        startDate: '2026-12-12',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'draft',
      });
    expect(res.status).toBe(201);
  });

  it('still allows publishing a genuinely FREE event when the organizer is not verified', async () => {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({
        title: 'Free Event Should Be Allowed',
        startDate: '2026-12-12',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 0, quantity: 20 }],
        status: 'published',
      });
    expect(res.status).toBe(201);
  });

  it('allows publishing a paid event once the organizer is verified', async () => {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .send({
        title: 'Verified Org Paid Event',
        startDate: '2026-12-12',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    expect(res.status).toBe(201);
  });
});
