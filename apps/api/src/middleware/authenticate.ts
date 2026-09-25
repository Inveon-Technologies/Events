import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/jwt';
import { organizerAccountBlock } from '../services/accountBlocks';
import { getBranding } from '../services/platformSettings';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length);

  let user;
  try {
    user = verifyAccessToken(token);
  } catch {
    // Don't distinguish expired vs. invalid vs. tampered in the response —
    // that's information an attacker can use; the client only needs to know
    // "re-authenticate."
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = user;

  // Suspended in the super admin portal: signed out straight away. If the
  // check itself fails (database hiccup) the request carries on — the
  // route's own queries will fail just the same.
  organizerAccountBlock(user.sub, user.organizerId)
    .then((blocked) => {
      if (blocked) {
        res.status(403).json({ error: `This account has been suspended. Contact ${getBranding().supportEmail}.`, suspended: true });
        return;
      }
      next();
    })
    .catch(() => next());
}
