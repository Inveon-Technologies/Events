import { signAccessToken, verifyAccessToken } from '../src/auth/jwt';

describe('JWT access tokens', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('signs a token and verifies it back to the original payload', () => {
    const token = signAccessToken({
      sub: 'user-123',
      role: 'organizer_staff',
      organizerId: 'org-456',
    });

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('organizer_staff');
    expect(decoded.organizerId).toBe('org-456');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-123', role: 'gate_volunteer', organizerId: null });
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
