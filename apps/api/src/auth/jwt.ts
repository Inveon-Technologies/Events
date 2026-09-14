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
