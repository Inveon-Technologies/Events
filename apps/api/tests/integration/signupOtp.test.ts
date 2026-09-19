import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { redis, connectRedis } from '../../src/db/redis';
import { Organizer, User } from '../../src/models';

describe('organizer signup + OTP verification (real DB + Redis)', () => {
  const app = createApp();
  const testEmail = `signup-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await User.destroy({ where: { email: testEmail } });
    await Organizer.destroy({ where: { contactEmail: testEmail } });
    await redis.quit();
    await sequelize.close();
  });

  it('signup creates an unverified user who cannot log in yet', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      fullName: 'Test Signup User',
      email: testEmail,
      phone: '+919876500000',
      orgName: `Integration Test Org ${Date.now()}`,
      password: 'TestPassword123',
    });
    expect(signupRes.status).toBe(201);

    const user = await User.findOne({ where: { email: testEmail } });
    expect(user).not.toBeNull();
    expect(user!.emailVerified).toBe(false);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'TestPassword123',
    });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.unverified).toBe(true);
  });

  it('rejects a wrong OTP code without consuming the real one', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('accepts the real OTP, verifies the user, and returns a working token — then rejects reuse of the same code', async () => {
    const realCode = await redis.get(`otp:signup:${testEmail}`);
    expect(realCode).not.toBeNull();

    const verifyRes = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: realCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toEqual(expect.any(String));
    expect(verifyRes.body.user.email).toBe(testEmail);

    const user = await User.findOne({ where: { email: testEmail } });
    expect(user!.emailVerified).toBe(true);

    const reuseRes = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: realCode });
    expect(reuseRes.status).toBe(400);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'TestPassword123',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toEqual(expect.any(String));
  });

  it('rejects a second signup with the same email', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      fullName: 'Someone Else',
      email: testEmail,
      phone: '+919876500001',
      orgName: 'Another Org',
      password: 'AnotherPassword123',
    });
    expect(res.status).toBe(409);
  });
});
