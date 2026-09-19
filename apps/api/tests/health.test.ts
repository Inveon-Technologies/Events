import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 and status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/health', () => {
  it('returns the same response as /health — for shared front-door nginx setups that only proxy /api/', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
