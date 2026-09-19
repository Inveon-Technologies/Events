import express, { Express, Request, Response } from 'express';
import { authRouter } from './routes/auth';
import { organizerRouter } from './routes/organizer';
import { publicBookingsRouter } from './routes/publicBookings';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Used by docker-compose's healthcheck and scripts/deploy.sh's rollback gate.
  // Keep this dependency-free (no DB/Redis calls) so it reflects "the process
  // is alive," not "every downstream service is healthy" — deeper checks can
  // get their own endpoint later if needed.
  const healthHandler = (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  };
  app.get('/health', healthHandler);
  // Same handler, reachable through the public domain — shared front-door
  // nginx setups (see docs on the production deployment) only proxy paths
  // under /api/, so external monitoring needs it there too.
  app.get('/api/health', healthHandler);

  app.use('/api/auth', authRouter);
  app.use('/api/organizer', organizerRouter);
  app.use('/api', publicBookingsRouter);

  return app;
}
