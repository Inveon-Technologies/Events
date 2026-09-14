import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/jwt';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // Don't distinguish expired vs. invalid vs. tampered in the response —
    // that's information an attacker can use; the client only needs to know
    // "re-authenticate."
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
