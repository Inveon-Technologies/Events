import express, { Express, Request, Response, NextFunction } from 'express';
import { authRouter } from './routes/auth';
import { organizerRouter } from './routes/organizer';
import { publicBookingsRouter } from './routes/publicBookings';
import { webhooksRouter } from './routes/webhooks';
import { integrationApiRouter } from './routes/integrationApi';
import { UPLOAD_DIR } from './services/eventMedia';

export function createApp(): Express {
  const app = express();

  // Production traffic arrives through two nginx hops (the shared
  // front-door that terminates TLS, then this stack's own nginx), so
  // req.protocol / req.ip must come from X-Forwarded-* — otherwise
  // every generated URL says http:// and every client shares the proxy's
  // IP for rate limiting. Configurable for other topologies.
  app.set('trust proxy', process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 2);

  // Mounted with express.raw(), and before the global express.json()
  // below — webhook signature verification needs the exact raw bytes
  // Cashfree sent (see routes/webhooks.ts), which express.json() would
  // already have consumed and re-parsed by the time a normal route
  // handler saw it.
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

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

  // Under /api/uploads, not a bare /uploads — the shared front-door nginx
  // only proxies /api/* to this container (see the /api/health comment
  // above), so anything outside that prefix would never actually be
  // reachable through the public domain without a separate nginx change.
  app.use('/api/uploads', express.static(UPLOAD_DIR));

  app.use('/api/v1', integrationApiRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/organizer', organizerRouter);
  app.use('/api', publicBookingsRouter);

  // Registered last, and with 4 parameters — that's how Express
  // recognizes error-handling middleware. Every route handler in this
  // app is wrapped in asyncHandler(), so any failure (a DB/Redis call
  // included) lands here instead of crashing the process: one clean
  // JSON 500, not a crash-restart loop. Deliberately doesn't leak `err`
  // details to the client — logged server-side instead.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in request:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
