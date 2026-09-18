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
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/organizer', organizerRouter);
  app.use(publicBookingsRouter);

  return app;
}
