import { Router, Request } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { verifyAccessToken, verifyCustomerSessionToken } from '../auth/jwt';
import { MobileNotification } from '../models';
import type { MobileApp, MobilePlatform } from '../models/MobileDevice';
import { getMobileAppConfig } from '../services/mobileApps';
import { registerDevice, unregisterDevice } from '../services/push';

// For the Flutter apps (apps/mobile): the update check, push-token
// registration and the in-app notification inbox. Everything else the
// apps need is the same API the website uses.
export const mobileRouter = Router();

const FIFTEEN_MINUTES = 15 * 60;
const deviceLimit = rateLimit({ name: 'mobile-device', windowSeconds: FIFTEEN_MINUTES, max: 60 });

const isApp = (v: unknown): v is MobileApp => v === 'customer' || v === 'organizer';
const isPlatform = (v: unknown): v is MobilePlatform => v === 'android' || v === 'ios';

// Who is signed in on the app, if anyone: a customer session (customer
// app) or an organizer access token (organizer app). A bad or expired
// token is treated as signed out, never as an error.
type Principal = { kind: 'customer'; email: string } | { kind: 'organizer'; userId: string; organizerId: string } | null;

function principalFrom(req: Request): Principal {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  try {
    return { kind: 'customer', email: verifyCustomerSessionToken(token).email };
  } catch {
    // Not a customer session — maybe an organizer token.
  }
  try {
    const user = verifyAccessToken(token);
    if (user.organizerId) return { kind: 'organizer', userId: user.sub, organizerId: user.organizerId };
  } catch {
    // Expired or invalid.
  }
  return null;
}

// GET /api/mobile/app-config?app=customer&platform=android&version=1.0.0
mobileRouter.get('/app-config', (req, res) => {
  const { app, platform, version } = req.query;
  if (!isApp(app) || !isPlatform(platform)) {
    res.status(400).json({ error: 'app (customer|organizer) and platform (android|ios) are required' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.json(getMobileAppConfig(app, platform, typeof version === 'string' && version ? version.slice(0, 32) : null));
});

// Called on every launch and after sign-in / sign-out with the current
// FCM token. The Authorization header (optional) links the device.
mobileRouter.post(
  '/devices',
  deviceLimit,
  asyncHandler(async (req, res) => {
    const { app, platform, fcmToken, appVersion } = req.body as Record<string, unknown>;
    if (!isApp(app) || !isPlatform(platform) || typeof fcmToken !== 'string' || !fcmToken.trim() || fcmToken.length > 512) {
      res.status(400).json({ error: 'app, platform and fcmToken are required' });
      return;
    }
    const who = principalFrom(req);
    await registerDevice({
      app,
      platform,
      fcmToken: fcmToken.trim(),
      appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 32) : null,
      customerEmail: app === 'customer' && who?.kind === 'customer' ? who.email : null,
      userId: app === 'organizer' && who?.kind === 'organizer' ? who.userId : null,
      organizerId: app === 'organizer' && who?.kind === 'organizer' ? who.organizerId : null,
    });
    res.status(204).end();
  }),
);

// On sign-out: the device stays registered (update notices) but stops
// getting the person's booking notifications.
mobileRouter.post(
  '/devices/unregister',
  deviceLimit,
  asyncHandler(async (req, res) => {
    const { fcmToken } = req.body as Record<string, unknown>;
    if (typeof fcmToken !== 'string' || !fcmToken.trim()) {
      res.status(400).json({ error: 'fcmToken is required' });
      return;
    }
    await unregisterDevice(fcmToken.trim());
    res.status(204).end();
  }),
);

function inboxWhere(who: NonNullable<Principal>): WhereOptions<MobileNotification> {
  return who.kind === 'customer'
    ? { app: 'customer', customerEmail: who.email.trim().toLowerCase() }
    : { app: 'organizer', organizerId: who.organizerId };
}

// The in-app notification inbox (newest first, last 100).
mobileRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const who = principalFrom(req);
    if (!who) {
      res.status(401).json({ error: 'Please sign in again' });
      return;
    }
    const rows = await MobileNotification.findAll({ where: inboxWhere(who), order: [['createdAt', 'DESC']], limit: 100 });
    res.json({
      unread: rows.filter((r) => !r.readAt).length,
      notifications: rows.map((r) => ({
        id: String(r.id),
        kind: r.kind,
        title: r.title,
        body: r.body,
        data: r.data ?? {},
        read: Boolean(r.readAt),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

// Marks the given notifications read, or all of them when no ids are sent.
mobileRouter.post(
  '/notifications/read',
  asyncHandler(async (req, res) => {
    const who = principalFrom(req);
    if (!who) {
      res.status(401).json({ error: 'Please sign in again' });
      return;
    }
    const { ids } = req.body as { ids?: unknown };
    const idList = Array.isArray(ids) ? ids.map((i) => Number(i)).filter((i) => Number.isInteger(i) && i > 0) : null;
    await MobileNotification.update(
      { readAt: new Date() },
      { where: { ...inboxWhere(who), readAt: null, ...(idList ? { id: { [Op.in]: idList } } : {}) } as WhereOptions<MobileNotification> },
    );
    res.status(204).end();
  }),
);
