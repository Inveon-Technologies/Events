import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User';

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
  organizerId: string | null;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set (see .env.example)');
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '12h' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // jwt.verify's return type is generic (string | JwtPayload) — the cast is
  // safe here because we control every place that signs a token above, and
  // they all use this exact shape.
  return jwt.verify(token, getSecret()) as unknown as AccessTokenPayload;
}

// A customer session is a genuinely different kind of principal from an
// organizer User — no id, no role, just a real OTP-verified email — so
// it gets its own payload shape and its own sign/verify pair rather than
// overloading AccessTokenPayload with an optional/nullable customer case.
export interface CustomerSessionPayload {
  email: string;
  purpose: 'customer_session';
}

export function signCustomerSessionToken(email: string): string {
  return jwt.sign({ email, purpose: 'customer_session' } satisfies CustomerSessionPayload, getSecret(), { expiresIn: '24h' });
}

export function verifyCustomerSessionToken(token: string): CustomerSessionPayload {
  const payload = jwt.verify(token, getSecret()) as unknown as CustomerSessionPayload;
  if (payload.purpose !== 'customer_session') {
    throw new Error('Not a valid customer session token');
  }
  return payload;
}
