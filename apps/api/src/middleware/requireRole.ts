import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../models/User';

export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Programmer error if this fires — requireRole() must run after
      // authenticate(). Fail loudly rather than silently letting it through.
      res.status(500).json({ error: 'requireRole used without authenticate' });
      return;
    }

    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}
