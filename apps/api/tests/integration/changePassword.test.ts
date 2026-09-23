import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User } from '../../src/models';
import { hashPassword, comparePassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('real change-password (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({ name: `Password Test Org ${suffix}`, slug: `password-test-org-${suffix}` });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `password-test-${suffix}@example.com`,
      passwordHash: await hashPassword('OriginalPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    userId = user.id;
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('rejects the wrong current password, real hash comparison, not a fake success', async () => {
    const res = await request(app)
      .post('/api/organizer/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword123', newPassword: 'BrandNewPassword123' });
    expect(res.status).toBe(401);

    const user = await User.findByPk(userId);
    expect(await comparePassword('OriginalPassword123', user!.passwordHash)).toBe(true);
  });

  it('rejects a new password under 8 characters', async () => {
    const res = await request(app)
      .post('/api/organizer/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OriginalPassword123', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('with the correct current password, actually changes the real stored password hash', async () => {
    const res = await request(app)
      .post('/api/organizer/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OriginalPassword123', newPassword: 'BrandNewPassword123' });
    expect(res.status).toBe(200);

    const user = await User.findByPk(userId);
    expect(await comparePassword('BrandNewPassword123', user!.passwordHash)).toBe(true);
    expect(await comparePassword('OriginalPassword123', user!.passwordHash)).toBe(false);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: `password-test-${suffix}@example.com`, password: 'BrandNewPassword123' });
    expect(loginRes.status).toBe(200);
  });
});
