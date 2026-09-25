import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, EventMedia } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { S3Client } from '@aws-sdk/client-s3';
import { isS3Configured } from '../../src/services/s3Storage';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});

const mockSend = jest.fn();
(S3Client as unknown as jest.Mock).mockImplementation(() => ({ send: mockSend }));

describe('S3 media storage (real DB, real HTTP upload, AWS SDK mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let eventId: string;
  const fixturesDir = path.join(os.tmpdir(), `s3-media-fixtures-${suffix}`);
  let imagePath: string;

  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await fs.mkdir(fixturesDir, { recursive: true });
    imagePath = path.join(fixturesDir, 'test-image.jpg');
    // A minimal but real JPEG (SOI + EOI markers) — enough for multer's
    // pipeline and this codebase's own validation, same fixture
    // approach as the existing local-disk media tests.
    await fs.writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const organizer = await Organizer.create({
      name: `S3 Test Org ${suffix}`,
      slug: `s3-test-org-${suffix}`,
      cashfreeVendorId: `s3_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `s3-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const eventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `S3 Media Test Event ${suffix}`,
        startDate: '2026-12-15',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'draft',
      });
    eventId = eventRes.body.id;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    mockSend.mockReset();
  });

  afterAll(async () => {
    await EventMedia.destroy({ where: { eventId } });
    await TicketCategory.destroy({ where: { eventId } });
    await Event.destroy({ where: { id: eventId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  function setS3Env() {
    process.env.S3_BUCKET = 'inveon-events-uploads-test';
    process.env.S3_ACCESS_KEY = 'test-access-key';
    process.env.S3_SECRET_KEY = 'test-secret-key';
    process.env.AWS_REGION = 'ap-south-1';
  }

  it('isS3Configured is false unless all four required variables are set', () => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.AWS_REGION;
    expect(isS3Configured()).toBe(false);

    process.env.S3_BUCKET = 'a-bucket';
    process.env.S3_ACCESS_KEY = 'a-key';
    process.env.S3_SECRET_KEY = 'a-secret';
    expect(isS3Configured()).toBe(false); // AWS_REGION still missing

    process.env.AWS_REGION = 'ap-south-1';
    expect(isS3Configured()).toBe(true);
  });

  it('the S3 PutObjectCommand is called with the real bucket, a key under events/{eventId}/, and no ACL, and the response URL matches it exactly', async () => {
    setS3Env();
    mockSend.mockResolvedValue({});

    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    expect(res.status).toBe(201);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.Bucket).toBe('inveon-events-uploads-test');
    expect(command.input.Key).toMatch(new RegExp(`^events/${eventId}/`));
    expect(command.input.ContentType).toBe('image/jpeg');
    expect(command.input.ACL).toBeUndefined(); // buckets with ACLs disabled reject this outright

    // Linked through the API, not the bucket: the bucket never has to be public.
    expect(res.body.url).toBe(`/api/uploads/${command.input.Key}`);
  });

  it('serves S3-stored images through /api/uploads with the API\'s credentials (private bucket), for every folder', async () => {
    setS3Env();
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    mockSend.mockImplementation(async (command: { input: { Key: string } }) => {
      if (command.input.Key === 'organizers/org-1/logo.png') {
        return { ContentType: 'image/png', Body: { transformToByteArray: async () => new Uint8Array(png) } };
      }
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    });

    const res = await request(app).get('/api/uploads/organizers/org-1/logo.png').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age');
    expect(Buffer.from(res.body).equals(png)).toBe(true);
    expect(mockSend.mock.calls[0][0].input).toEqual({ Bucket: 'inveon-events-uploads-test', Key: 'organizers/org-1/logo.png' });

    const missing = await request(app).get('/api/uploads/organizers/org-1/nope.png');
    expect(missing.status).toBe(404);

    mockSend.mockClear();
    const escape = await request(app).get('/api/uploads/..%2F..%2Fetc%2Fpasswd');
    expect(escape.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('deleting S3-stored media calls DeleteObjectCommand with the matching key, not a local file delete', async () => {
    setS3Env();
    mockSend.mockResolvedValue({});

    const uploadRes = await request(app)
      .post(`/api/organizer/events/${eventId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);
    const uploadedKey = mockSend.mock.calls[0][0].input.Key;
    mockSend.mockClear();

    const deleteRes = await request(app)
      .delete(`/api/organizer/events/${eventId}/media/${uploadRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const deleteCommand = mockSend.mock.calls[0][0];
    expect(deleteCommand.input.Bucket).toBe('inveon-events-uploads-test');
    expect(deleteCommand.input.Key).toBe(uploadedKey);
  });

  it('falls back to local disk (a relative /api/uploads URL) when S3 is not configured, with no S3 calls made', async () => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    delete process.env.AWS_REGION;

    const res = await request(app)
      .post(`/api/organizer/events/${eventId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', imagePath);

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/api\/uploads\/events\//);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
