import request from 'supertest';
import { createApp } from '../src/app';
import { compareVersions } from '../src/services/push';

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0+12', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0-beta', '2.0.0')).toBe(0);
  });
});

describe('GET /api/mobile/app-config', () => {
  const app = createApp();

  it('requires app and platform', async () => {
    const res = await request(app).get('/api/mobile/app-config?app=web&platform=android');
    expect(res.status).toBe(400);
  });

  it('reports no update for the current version', async () => {
    const res = await request(app).get('/api/mobile/app-config?app=customer&platform=android&version=1.0.0');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ app: 'customer', latestVersion: '1.0.0', updateAvailable: false, updateRequired: false });
  });

  it('flags an older install as needing an update', async () => {
    const res = await request(app).get('/api/mobile/app-config?app=organizer&platform=ios&version=0.9.0');
    expect(res.body).toMatchObject({ updateAvailable: true, updateRequired: true });
  });
});

describe('mobile inbox auth', () => {
  it('rejects a request without a session', async () => {
    const res = await request(createApp()).get('/api/mobile/notifications');
    expect(res.status).toBe(401);
  });
});
