import express, { Express, Request, Response, NextFunction } from 'express';
import { authRouter } from './routes/auth';
import { organizerRouter } from './routes/organizer';
import { publicBookingsRouter } from './routes/publicBookings';
import { webhooksRouter } from './routes/webhooks';
import { integrationApiRouter } from './routes/integrationApi';
import { superAdminRouter } from './routes/superAdmin';
import { getBranding, getCertificateFooter, getInvoiceSettings } from './services/platformSettings';
import { UPLOAD_DIR } from './services/eventMedia';
import { getS3Object, isS3Configured, MEDIA_URL_PREFIX, s3KeyFromUrl } from './services/s3Storage';
import { logger } from './logger';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): Express {
  const app = express();

  // Production traffic arrives through two nginx hops (the shared
  // front-door that terminates TLS, then this stack's own nginx), so
  // req.protocol / req.ip must come from X-Forwarded-* — otherwise
  // every generated URL says http:// and every client shares the proxy's
  // IP for rate limiting. Configurable for other topologies.
  app.set('trust proxy', process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 2);

  // First, so every request — webhooks included — gets a request id and
  // one structured log line (see middleware/requestLogger.ts).
  app.use(requestLogger);

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
  // Local disk first (dev, or files from before S3 was set up), then the
  // S3 bucket — read with the API's own credentials, so the bucket stays
  // private. File names are random UUIDs that never change, hence the
  // long cache.
  app.use('/api/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }), async (req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !isS3Configured()) {
      next();
      return;
    }
    const key = s3KeyFromUrl(`${MEDIA_URL_PREFIX}${decodeURIComponent(req.path)}`);
    if (!key) {
      next();
      return;
    }
    try {
      const obj = await getS3Object(key);
      if (!obj) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res
        .set('Cache-Control', 'public, max-age=2592000, immutable')
        .set('X-Content-Type-Options', 'nosniff')
        .type(obj.contentType || 'application/octet-stream')
        .send(obj.body);
    } catch (err) {
      next(err);
    }
  });

  // Logo, name and certificate footer set in the super admin portal —
  // used by the website header/footer and the certificate designer.
  app.get('/api/platform/branding', (_req: Request, res: Response) => {
    const b = getBranding();
    const invoice = getInvoiceSettings();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      platformName: b.platformName,
      logoUrl: b.logoUrl,
      supportEmail: b.supportEmail,
      supportPhone: b.supportPhone,
      primaryColor: b.primaryColor,
      companyName: invoice.companyName,
      certificateFooter: getCertificateFooter(),
    });
  });

  // Super admin portal (Inveon staff) — behind a secret path segment.
  app.use('/api/sa/:pathKey', superAdminRouter);

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
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    (req.log ?? logger).error({ err }, 'Unhandled error in request');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
