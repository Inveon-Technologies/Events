import { hashPassword, comparePassword } from '../src/auth/password';

describe('password hashing', () => {
  it('hashes a password and can verify it against the hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    await expect(comparePassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password against a real hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(comparePassword('wrong password', hash)).resolves.toBe(false);
  });
});
