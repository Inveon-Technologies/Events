import { Request, Response } from 'express';
import { authenticate } from '../src/middleware/authenticate';
import { requireRole } from '../src/middleware/requireRole';
import { signAccessToken } from '../src/auth/jwt';

function mockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authenticate middleware', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  });

  it('rejects a request with no Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next() for a valid token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'organizer_owner', organizerId: 'org-1' });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.sub).toBe('user-1');
  });
});

describe('requireRole middleware', () => {
  it('allows a matching role through', () => {
    const req = { user: { sub: 'u1', role: 'gate_volunteer', organizerId: 'org-1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('gate_volunteer', 'organizer_staff')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks a non-matching role with 403', () => {
    const req = { user: { sub: 'u1', role: 'gate_volunteer', organizerId: 'org-1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('platform_admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
