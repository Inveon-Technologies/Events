import os from 'os';
import path from 'path';
import fs from 'fs';
import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { resetShellCacheForTests } from '../../src/services/seo';

describe('search engine pages (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let slug: string;
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));

  beforeAll(async () => {
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><html lang="en-IN"><head><title>Inveon Events</title><script type="module" src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>',
    );
    process.env.WEB_DIST_DIR = distDir;
    process.env.WEB_PUBLIC_URL = 'https://events.example.in';
    resetShellCacheForTests();

    const organizer = await Organizer.create({
      name: `SEO Test Org ${suffix}`,
      slug: `seo-test-org-${suffix}`,
      cashfreeVendorId: `seo_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `seo-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Rajgad Sunrise Trek ${suffix}`,
        shortDescription: 'Watch the sunrise from Balekilla',
        description: 'A guided night trek to Rajgad fort.',
        startDate: '2030-11-15',
        startTime: '05:00',
        venueName: 'Gunjavane Village',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '412213',
        ticketTiers: [{ name: 'General', price: 1499, quantity: 30, maxPerBooking: 4 }],
        status: 'published',
      });
    expect(res.status).toBe(201);
    slug = res.body.slug;
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    for (const event of events) await TicketCategory.destroy({ where: { eventId: event.id } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('renders an event page with its title, Open Graph tags, Event JSON-LD and crawlable text', async () => {
    const res = await request(app).get('/api/seo/page').set('X-Seo-Path', `/events/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain(`<title>Rajgad Sunrise Trek ${suffix}`);
    expect(res.text).toContain(`<link rel="canonical" href="https://events.example.in/events/${slug}" />`);
    expect(res.text).toContain('<meta property="og:title"');
    expect(res.text).toContain('/assets/index-abc.js');
    const ld = [...res.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const eventLd = ld.find((x) => x['@type'] === 'Event');
    expect(eventLd.startDate).toBe('2030-11-15T05:00:00+05:30');
    expect(eventLd.location.address.addressLocality).toBe('Pune');
    expect(eventLd.offers[0]).toMatchObject({ price: '1499.00', priceCurrency: 'INR', availability: 'https://schema.org/InStock' });
    expect(res.text).toContain(`<h1>Rajgad Sunrise Trek ${suffix}</h1>`);
  });

  it('keeps the organizer-set max tickets per booking', async () => {
    const pub = await request(app).get(`/api/events/${slug}`);
    expect(pub.body.ticketCategories[0].maxPerBooking).toBe(4);
  });

  it('answers an unknown event with a noindex 404', async () => {
    const res = await request(app).get('/api/seo/page').set('X-Seo-Path', '/events/no-such-event-anywhere');
    expect(res.status).toBe(404);
    expect(res.text).toContain('noindex');
  });

  it('serves the same tags as JSON for client-side navigation', async () => {
    const res = await request(app)
      .get('/api/seo/meta')
      .query({ path: `/events/${slug}` });
    expect(res.status).toBe(200);
    expect(res.body.canonical).toBe(`https://events.example.in/events/${slug}`);
    expect(res.body.jsonLd.some((x: { '@type': string }) => x['@type'] === 'Event')).toBe(true);
  });

  it('lists the event, with its image entries, in the sitemap', async () => {
    const res = await request(app).get('/api/seo/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain(`<loc>https://events.example.in/events/${slug}</loc>`);
    expect(res.text).toContain(`<loc>https://events.example.in/organizers/seo-test-org-${suffix}</loc>`);
  });
});
