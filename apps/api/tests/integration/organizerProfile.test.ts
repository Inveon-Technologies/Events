import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real organizer profile + logo upload (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Profile Test Org ${suffix}`,
      slug: `profile-test-org-${suffix}`,
      contactEmail: `original-${suffix}@example.com`,
      contactPhone: '+919000000000',
      about: 'Original bio text',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `profile-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({ name: `Other Profile Org ${suffix}`, slug: `other-profile-org-${suffix}` });
    const otherUser = await User.create({
      organizerId: otherOrganizer.id,
      email: `other-profile-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizer.id });
  });

  afterAll(async () => {
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('GET /organizer/profile returns the real current profile', async () => {
    const res = await request(app).get('/api/organizer/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Profile Test Org ${suffix}`);
    expect(res.body.contactEmail).toBe(`original-${suffix}@example.com`);
    expect(res.body.about).toBe('Original bio text');
    expect(res.body.logoUrl).toBeNull();
  });

  it('PATCH /organizer/profile actually persists real changes', async () => {
    const res = await request(app)
      .patch('/api/organizer/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Updated Profile Org ${suffix}`, about: 'Updated bio text' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Updated Profile Org ${suffix}`);
    expect(res.body.about).toBe('Updated bio text');

    const getRes = await request(app).get('/api/organizer/profile').set('Authorization', `Bearer ${token}`);
    expect(getRes.body.name).toBe(`Updated Profile Org ${suffix}`);
    expect(getRes.body.about).toBe('Updated bio text');
    expect(getRes.body.contactPhone).toBe('+919000000000');
  });

  it('PATCH /organizer/profile rejects an empty name', async () => {
    const res = await request(app).patch('/api/organizer/profile').set('Authorization', `Bearer ${token}`).send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('POST /organizer/profile/logo actually uploads and persists a real logo — the fix for "profile upload not working"', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-logo-${suffix}.png`);
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    fs.writeFileSync(tmpFile, pngBytes);

    const res = await request(app)
      .post('/api/organizer/profile/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tmpFile, { filename: 'logo.png', contentType: 'image/png' });
    fs.unlinkSync(tmpFile);

    expect(res.status).toBe(201);
    expect(res.body.logoUrl).toBeTruthy();

    const getRes = await request(app).get('/api/organizer/profile').set('Authorization', `Bearer ${token}`);
    expect(getRes.body.logoUrl).toBe(res.body.logoUrl);
  });

  it('rejects an unsupported file type for the logo', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-logo-bad-${suffix}.txt`);
    fs.writeFileSync(tmpFile, 'not an image');

    const res = await request(app)
      .post('/api/organizer/profile/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tmpFile, { filename: 'logo.txt', contentType: 'text/plain' });
    fs.unlinkSync(tmpFile);

    expect(res.status).toBe(400);
  });

  it('scopes the profile to the token\'s own organizer, never another organizer\'s data', async () => {
    const getRes = await request(app).get('/api/organizer/profile').set('Authorization', `Bearer ${otherToken}`);
    expect(getRes.body.name).toBe(`Other Profile Org ${suffix}`);
    expect(getRes.body.name).not.toContain('Profile Test Org');
  });
});
