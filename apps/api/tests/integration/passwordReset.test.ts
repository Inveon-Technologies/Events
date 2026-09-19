import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { redis, connectRedis } from '../../src/db/redis';
import { Organizer, User } from '../../src/models';
import { hashPassword } from '../../src/auth/password';

describe('forgot password (real DB + Redis)', () => {
  const app = createApp();
  const testEmail = `reset-test-${Date.now()}@example.com`;
  const originalPassword = 'OriginalPassword123';

  beforeAll(async () => {
    await connectRedis();
    const organizer = await Organizer.create({
      name: `Reset Test Org ${Date.now()}`,
      slug: `reset-test-org-${Date.now()}`,
      contactEmail: testEmail,
    });
    await User.create({
      organizerId: organizer.id,
      email: testEmail,
      passwordHash: await hashPassword(originalPassword),
      role: 'organizer_owner',
      name: 'Reset Test User',
      emailVerified: true,
    });
  });

  afterAll(async () => {
    const user = await User.findOne({ where: { email: testEmail } });
    if (user?.organizerId) await Organizer.destroy({ where: { id: user.organizerId } });
    await User.destroy({ where: { email: testEmail } });
    await redis.quit();
    await sequelize.close();
  });

  it('gives an identical response for a registered and an unregistered email (no enumeration)', async () => {
    const realRes = await request(app).post('/api/auth/forgot-password').send({ email: testEmail });
    const fakeRes = await request(app).post('/api/auth/forgot-password').send({ email: 'never-registered@example.com' });
    expect(realRes.status).toBe(fakeRes.status);
    expect(realRes.body).toEqual(fakeRes.body);
  });

  it('rejects a wrong OTP', async () => {
    const res = await request(app).post('/api/auth/verify-reset-otp').send({ email: testEmail, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('accepts the real OTP, exchanges it for a reset token, and actually changes the password — old password stops working, new one works, and the token cannot be reused', async () => {
    const realCode = await redis.get(`otp:reset:${testEmail}`);
    expect(realCode).not.toBeNull();

    const verifyRes = await request(app).post('/api/auth/verify-reset-otp').send({ email: testEmail, code: realCode });
    expect(verifyRes.status).toBe(200);
    const resetToken = verifyRes.body.resetToken;
    expect(resetToken).toEqual(expect.any(String));

    const newPassword = 'BrandNewPassword456';
    const resetRes = await request(app).post('/api/auth/reset-password').send({ resetToken, newPassword });
    expect(resetRes.status).toBe(200);

    const oldLoginRes = await request(app).post('/api/auth/login').send({ email: testEmail, password: originalPassword });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app).post('/api/auth/login').send({ email: testEmail, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.token).toEqual(expect.any(String));

    const reuseRes = await request(app).post('/api/auth/reset-password').send({ resetToken, newPassword: 'AnotherPassword789' });
    expect(reuseRes.status).toBe(400);
  });
});
