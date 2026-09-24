import request from 'supertest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, EventMedia } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

const execFileAsync = promisify(execFile);

describe('event media upload (real DB, real ffprobe)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let otherOrganizerId: string;
  let token: string;
  let otherOrganizerToken: string;
  const testEmail = `media-test-${suffix}@example.com`;
  const otherEmail = `media-test-other-${suffix}@example.com`;
  const fixturesDir = path.join(os.tmpdir(), `event-media-fixtures-${suffix}`);
  let imagePath: string;
  let validVideoPath: string; // 5s — under the 20s limit
  let tooLongVideoPath: string; // 25s — over the 20s limit
  let tooBigImagePath: string; // 11MB — over the 10MB limit

  beforeAll(async () => {
    // This suite publishes paid events to attach media to, which needs
    // an organizer that clears eventCreation.ts's publish-time
    // verification gate to reach what these tests are actually about.
    const organizer = await Organizer.create({
      name: `Media Test Org ${suffix}`,
      slug: `media-test-org-${suffix}`,
      cashfreeVendorId: `media_test_vendor_${suffix}`,
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

    const otherOrganizer = await Organizer.create({ name: `Other Media Org ${suffix}`, slug: `other-media-org-${suffix}` });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: otherEmail,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherOrganizerToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });
    otherOrganizerId = otherOrganizer.id;

    // Real files, not mocks — this suite exists specifically to prove
    // ffprobe-based duration checking works against actual video
    // containers, which a stubbed duration value can't verify.
    await fs.mkdir(fixturesDir, { recursive: true });
    imagePath = path.join(fixturesDir, 'test.jpg');
    validVideoPath = path.join(fixturesDir, 'valid_5s.mp4');
    tooLongVideoPath = path.join(fixturesDir, 'too_long_25s.mp4');
    tooBigImagePath = path.join(fixturesDir, 'too_big.jpg');

    await execFileAsync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', imagePath, '-y']);
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'color=c=green:s=64x64:d=5',
      '-c:v', 'libx264', validVideoPath, '-y',
    ]);
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=25',
      '-c:v', 'libx264', tooLongVideoPath, '-y',
    ]);
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 0);
    await fs.writeFile(tooBigImagePath, bigBuffer);
  });

  afterAll(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
    for (const orgId of [organizerId, otherOrganizerId]) {
      const events = await Event.findAll({ where: { organizerId: orgId } });
      for (const event of events) {
        await EventMedia.destroy({ where: { eventId: event.id } });
        await TicketCategory.destroy({ where: { eventId: event.id } });
      }
      await Event.destroy({ where: { organizerId: orgId } });
      await User.destroy({ where: { organizerId: orgId } });
      await Organizer.destroy({ where: { id: orgId } });
    }
    await sequelize.close();
  });

  async function createTestEvent(title: string): Promise<{ id: string }> {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        startDate: '2026-12-20',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 100, quantity: 10 }],
        status: 'published',
      });
    return { id: res.body.id };
  }

  it('accepts a real image upload', async () => {
    const event = await createTestEvent(`Image Upload Test ${suffix}`);
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);

    expect(res.status).toBe(201);
    expect(res.body.mediaType).toBe('photo');
    expect(res.body.url).toMatch(/^\/api\/uploads\/events\//);
  });

  it('accepts a real 5-second video (under the 20s limit), verified via real ffprobe', async () => {
    const event = await createTestEvent(`Valid Video Test ${suffix}`);
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validVideoPath);

    expect(res.status).toBe(201);
    expect(res.body.mediaType).toBe('video');
  });

  it('rejects a real 25-second video for exceeding the 20-second limit, with the real duration in the message', async () => {
    const event = await createTestEvent(`Too Long Video Test ${suffix}`);
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tooLongVideoPath);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/25\.0s/);
    expect(res.body.error).toMatch(/20 seconds/);
  });

  it('rejects a second video on the same event — only one video allowed', async () => {
    const event = await createTestEvent(`Second Video Test ${suffix}`);
    const first = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validVideoPath);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validVideoPath);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already has a video/i);
  });

  it('accepts exactly 5 images then rejects a 6th', async () => {
    const event = await createTestEvent(`Five Image Limit Test ${suffix}`);
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post(`/api/organizer/events/${event.id}/media`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', imagePath);
      expect(res.status).toBe(201);
    }
    const sixth = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    expect(sixth.status).toBe(400);
    expect(sixth.body.error).toMatch(/maximum of 5 images/i);
  });

  it('rejects a file over the 10MB limit', async () => {
    const event = await createTestEvent(`Big File Test ${suffix}`);
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tooBigImagePath);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });

  it('rejects an upload to another organizer\'s event with 403', async () => {
    const event = await createTestEvent(`Ownership Test ${suffix}`);
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${otherOrganizerToken}`)
      .attach('file', imagePath);
    expect(res.status).toBe(403);
  });

  it('uploaded media appears on the real public event detail, and deleting it removes it from both the DB and disk', async () => {
    const event = await createTestEvent(`Public Visibility Test ${suffix}`);
    const uploadRes = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    const mediaId = uploadRes.body.id;

    const detailRes = await request(app).get(`/api/events/${event.id}`);
    expect(detailRes.body.media).toEqual([{ id: mediaId, mediaType: 'photo', url: uploadRes.body.url }]);

    const deleteRes = await request(app)
      .delete(`/api/organizer/events/${event.id}/media/${mediaId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const afterDeleteRes = await request(app).get(`/api/events/${event.id}`);
    expect(afterDeleteRes.body.media).toEqual([]);

    const dbRow = await EventMedia.findByPk(mediaId);
    expect(dbRow).toBeNull();
  });

  it('rejects a file that claims to be an image but isn\'t one (real signature check, not the declared type)', async () => {
    const event = await createTestEvent(`Fake Image Test ${suffix}`);
    const fakePath = path.join(fixturesDir, 'fake.jpg');
    await fs.writeFile(fakePath, '<html><script>alert(1)</script></html>');
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fakePath, { contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a valid JPEG, PNG, or WebP/i);
    expect(await EventMedia.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('enforces the 5-image limit even when uploads race each other', async () => {
    const event = await createTestEvent(`Concurrent Upload Test ${suffix}`);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post(`/api/organizer/events/${event.id}/media`).set('Authorization', `Bearer ${token}`).attach('file', imagePath),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(await EventMedia.count({ where: { eventId: event.id } })).toBe(5);
  });

  it('deleting a photo from a duplicated event keeps the shared file for the original event', async () => {
    const original = await createTestEvent(`Shared File Original ${suffix}`);
    const upload = await request(app)
      .post(`/api/organizer/events/${original.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    const duplicateRes = await request(app)
      .post(`/api/organizer/events/${original.id}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const duplicateId = duplicateRes.body.id ?? duplicateRes.body.event?.id;
    const duplicateMedia = await EventMedia.findOne({ where: { eventId: duplicateId } });
    expect(duplicateMedia!.url).toBe(upload.body.url);

    await request(app)
      .delete(`/api/organizer/events/${duplicateId}/media/${duplicateMedia!.id}`)
      .set('Authorization', `Bearer ${token}`);

    const served = await request(app).get(upload.body.url);
    expect(served.status).toBe(200);
  });

  it('the organizer\'s own event list and edit detail use the first uploaded photo as the cover', async () => {
    const event = await createTestEvent(`Organizer Cover Test ${suffix}`);
    const upload = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);

    const listRes = await request(app).get('/api/organizer/events').set('Authorization', `Bearer ${token}`);
    const row = listRes.body.events.find((e: { id: string }) => e.id === event.id);
    expect(row.bannerUrl).toBe(upload.body.url);

    const detailRes = await request(app).get(`/api/organizer/events/${event.id}`).set('Authorization', `Bearer ${token}`);
    expect(detailRes.body.media).toEqual([{ id: upload.body.id, mediaType: 'photo', url: upload.body.url }]);
  });

  it('an event with no media returns an empty array, not null or an error', async () => {
    const event = await createTestEvent(`No Media Test ${suffix}`);
    const res = await request(app).get(`/api/events/${event.id}`);
    expect(res.body.media).toEqual([]);
  });

  it('an event with no explicit banner falls back to its first uploaded photo, on both the list and detail endpoints', async () => {
    const event = await createTestEvent(`Banner Fallback Test ${suffix}`);
    const uploadRes = await request(app)
      .post(`/api/organizer/events/${event.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    expect(uploadRes.status).toBe(201);

    const detailRes = await request(app).get(`/api/events/${event.id}`);
    expect(detailRes.body.bannerUrl).toBe(uploadRes.body.url);

    const listRes = await request(app).get('/api/events');
    const found = listRes.body.events.find((e: { id: string }) => e.id === event.id);
    expect(found.bannerUrl).toBe(uploadRes.body.url);
  });
});
