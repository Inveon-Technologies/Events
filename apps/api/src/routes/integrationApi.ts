import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { authenticateApiCredential } from '../services/apiCredentials';
import {
  getIntegrationOrganizer,
  listIntegrationEvents,
  getIntegrationEvent,
  NotFoundError,
} from '../services/integrationApi';
import type { DisplayEventStatus } from '../services/organizerEvents';

// Read-only API for an organizer's own website/app, authenticated with
// the app key + secret created under Settings → Integrations. Send them
// as `X-App-Key` / `X-App-Secret` headers, or as HTTP Basic auth
// (key as username, secret as password).
export const integrationApiRouter = Router();

declare module 'express-serve-static-core' {
  interface Request {
    integration?: { organizerId: string; credentialId: string };
  }
}

// Callable from another site's browser code. Credentials are sent in
// headers (never cookies), so allowing any origin doesn't expose any
// session — though keeping the secret on a server is still recommended.
integrationApiRouter.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, X-App-Key, X-App-Secret, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function readCredentials(req: Request): { appKey: string; appSecret: string } | null {
  const appKey = req.header('x-app-key');
  const appSecret = req.header('x-app-secret');
  if (appKey && appSecret) return { appKey, appSecret };

  const auth = req.header('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep > 0) return { appKey: decoded.slice(0, sep), appSecret: decoded.slice(sep + 1) };
  }
  return null;
}

// Failed attempts are limited per client IP; successful traffic per key.
const failedAuthLimit = rateLimit({ name: 'integration-auth', windowSeconds: 15 * 60, max: 30 });

integrationApiRouter.use(
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const creds = readCredentials(req);
    const result = creds ? await authenticateApiCredential(creds.appKey, creds.appSecret) : null;
    if (!result) {
      failedAuthLimit(req, res, () => {
        res.status(401).json({ error: 'Missing or invalid app key / app secret' });
      });
      return;
    }
    req.integration = result;
    next();
  }),
);

integrationApiRouter.use(
  rateLimit({ name: 'integration-api', windowSeconds: 60, max: 120, keyFor: (req) => req.integration?.credentialId ?? req.ip ?? '' }),
);

const STATUSES: Array<DisplayEventStatus | 'all'> = ['all', 'draft', 'published', 'completed', 'cancelled'];

integrationApiRouter.get('/organizer', asyncHandler(async (req, res) => {
  res.status(200).json(await getIntegrationOrganizer(req.integration!.organizerId));
}));

integrationApiRouter.get('/events', asyncHandler(async (req, res) => {
  const { status, includeDrafts, page, pageSize } = req.query;
  const result = await listIntegrationEvents({
    organizerId: req.integration!.organizerId,
    status: typeof status === 'string' && STATUSES.includes(status as never) ? (status as DisplayEventStatus | 'all') : 'all',
    includeDrafts: includeDrafts === 'true' || status === 'draft',
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.status(200).json(result);
}));

integrationApiRouter.get('/events/:idOrSlug', asyncHandler(async (req, res) => {
  try {
    const event = await getIntegrationEvent(req.integration!.organizerId, req.params.idOrSlug, req.query.includeDrafts === 'true');
    res.status(200).json(event);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}));
