import request from 'supertest';
import { createApp } from '../src/app';

describe('global error handling', () => {
  const originalDbUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
  });

  it('returns a clean 500 instead of crashing when a route handler throws (e.g. a DB connection failure)', async () => {
    // No DATABASE_URL configured in this test environment at all — every
    // route that touches the DB already fails this way in this suite
    // (see the plain `npm test` DB-not-set warning), which is exactly
    // the scenario this test exists to cover: a rejected promise from
    // inside an async route handler must not become an unhandled
    // rejection that takes down the whole process, just one clean
    // failed response.
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: expect.any(String) });
    // Never leaks internal error detail (stack traces, SQL, connection
    // strings) to the client — that's for the server log only.
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|Sequelize|postgres:\/\//i);
  });

  it('the app instance keeps serving other requests after that failure — no crash', async () => {
    const app = createApp();
    await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });

    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
  });
});
