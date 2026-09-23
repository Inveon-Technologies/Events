import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, EventMedia } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real event duplication (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let otherToken: string;
  let sourceEventId: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Duplicate Test Org ${suffix}`,
      slug: `duplicate-test-org-${suffix}`,
      cashfreeVendorId: `dup_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `duplicate-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({ name: `Other Dup Org ${suffix}`, slug: `other-dup-org-${suffix}` });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: `other-dup-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Duplicate Source Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '09:00',
        venueName: 'Real Venue',
        city: 'Pune',
        state: 'Maharashtra',
        ticketTiers: [
          { name: 'General', price: 500, quantity: 20, description: 'Standard entry' },
          { name: 'VIP', price: 1500, quantity: 5, description: 'Front row' },
        ],
        status: 'published',
        cancellationPolicy: 'Full refund up to 3 days before.',
        allowSelfServiceCancellation: true,
        refundCutoffDays: 3,
        refundPercentage: 80,
        scheduleItems: [{ time: '09:00', title: 'Assembly', description: 'Meet at gate' }],
        packingChecklist: [{ item: 'Shoes', mandatory: true }],
        faqItems: [{ question: 'Is food included?', answer: 'Yes' }],
      });
    sourceEventId = eventRes.body.id;

    const tmpFile = path.join(os.tmpdir(), `test-dup-photo-${suffix}.png`);
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(tmpFile, pngBytes);
    await request(app)
      .post(`/api/organizer/events/${sourceEventId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tmpFile, { filename: 'photo.png', contentType: 'image/png' });
    fs.unlinkSync(tmpFile);
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    for (const event of events) {
      await EventMedia.destroy({ where: { eventId: event.id } });
      await TicketCategory.destroy({ where: { eventId: event.id } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('duplicates every real field — tiers, refund policy, schedule, packing, FAQ — not just the ones a frontend caller remembered to send', async () => {
    const res = await request(app).post(`/api/organizer/events/${sourceEventId}/duplicate`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(sourceEventId);

    const detail = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.title).toBe(`Duplicate Source Event ${suffix} (Copy)`);
    expect(detail.body.status).toBe('draft');
    expect(detail.body.cancellationPolicy).toBe('Full refund up to 3 days before.');
    expect(detail.body.allowSelfServiceCancellation).toBe(true);
    expect(detail.body.refundCutoffDays).toBe(3);
    expect(detail.body.refundPercentage).toBe(80);
    expect(detail.body.scheduleItems).toEqual([{ time: '09:00', title: 'Assembly', description: 'Meet at gate' }]);
    expect(detail.body.packingChecklist).toEqual([{ item: 'Shoes', mandatory: true }]);
    expect(detail.body.faqItems).toEqual([{ question: 'Is food included?', answer: 'Yes' }]);
    expect(detail.body.ticketTiers).toHaveLength(2);
    expect(detail.body.ticketTiers.map((t: { name: string }) => t.name).sort()).toEqual(['General', 'VIP']);
  });

  it('duplicates real uploaded media too — the exact gap the previous frontend-only duplicate silently had', async () => {
    const res = await request(app).post(`/api/organizer/events/${sourceEventId}/duplicate`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);

    const sourceMedia = await EventMedia.findAll({ where: { eventId: sourceEventId } });
    const newMedia = await EventMedia.findAll({ where: { eventId: res.body.id } });
    expect(sourceMedia).toHaveLength(1);
    expect(newMedia).toHaveLength(1);
    expect(newMedia[0].url).toBe(sourceMedia[0].url);
    expect(newMedia[0].id).not.toBe(sourceMedia[0].id);
  });

  it('a fresh ticket quota on the duplicate is fully available, independent of the source event\'s real sold quota', async () => {
    const res = await request(app).post(`/api/organizer/events/${sourceEventId}/duplicate`).set('Authorization', `Bearer ${token}`);
    const newTiers = await TicketCategory.findAll({ where: { eventId: res.body.id } });
    for (const tier of newTiers) {
      expect(tier.quotaRemaining).toBe(tier.quotaTotal);
    }
  });

  it('refuses to duplicate another organizer\'s event', async () => {
    const res = await request(app).post(`/api/organizer/events/${sourceEventId}/duplicate`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('404s cleanly for a nonexistent source event', async () => {
    const res = await request(app)
      .post('/api/organizer/events/00000000-0000-0000-0000-000000000000/duplicate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
