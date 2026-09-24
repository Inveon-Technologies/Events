import express from 'express';
import request from 'supertest';
import { rateLimit, resetInMemoryRateLimits } from '../src/middleware/rateLimit';

// Redis isn't connected in the plain unit-test run, so this exercises
// the in-memory fallback — the same counting logic the Redis path uses.
describe('rateLimit middleware', () => {
  beforeEach(() => resetInMemoryRateLimits());

  function appWith(max: number, enabled = true) {
    const app = express();
    app.get('/limited', rateLimit({ name: `test-${max}-${enabled}`, windowSeconds: 60, max, enabled }), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('allows up to max requests, then answers 429 with Retry-After', async () => {
    const app = appWith(3);
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get('/limited')).status).toBe(200);
    }
    const blocked = await request(app).get('/limited');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('60');
    expect(blocked.body.error).toMatch(/too many requests/i);
  });

  it('counts each client separately', async () => {
    const app = express();
    app.get(
      '/limited',
      rateLimit({ name: 'per-client', windowSeconds: 60, max: 1, enabled: true, keyFor: (req) => String(req.headers['x-client']) }),
      (_req, res) => { res.status(200).end(); },
    );
    expect((await request(app).get('/limited').set('x-client', 'a')).status).toBe(200);
    expect((await request(app).get('/limited').set('x-client', 'b')).status).toBe(200);
    expect((await request(app).get('/limited').set('x-client', 'a')).status).toBe(429);
  });

  it('is a no-op when disabled', async () => {
    const app = appWith(1, false);
    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
  });
});
