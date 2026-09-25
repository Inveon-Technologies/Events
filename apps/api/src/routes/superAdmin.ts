import crypto from 'crypto';
import os from 'os';
import fsp from 'fs/promises';
import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { PlatformAdmin } from '../models';
import {
  AdminAuthError,
  audit,
  startAdminLogin,
  finishAdminLogin,
  verifyAdminSession,
  changeAdminPassword,
  createPlatformAdmin,
  adminPasswordProblems,
  generateStrongPassword,
  ADMIN_SESSION_HOURS,
} from '../services/adminAuth';
import {
  AdminNotFoundError,
  AdminValidationError,
  adminDashboard,
  listOrganizers,
  organizerDetail,
  setOrganizerBlocked,
  setUserBlocked,
  listCustomers,
  blockCustomer,
  unblockCustomer,
  listEvents,
  setEventStatus,
  listBookings,
  listPayments,
  listNotifications,
  listAudit,
  purgeLogs,
} from '../services/superAdminData';
import {
  systemInfo,
  listBackups,
  createBackup,
  backupPath,
  deleteBackup,
  BackupError,
  hostStatus,
  hostLog,
  requestHostAction,
  systemBackupPath,
  OpsError,
} from '../services/adminSystem';
import {
  getBranding,
  getInvoiceSettings,
  getCertificateFooter,
  saveSetting,
  integrationView,
  saveIntegrations,
  DEFAULT_BRANDING,
  DEFAULT_INVOICE,
  DEFAULT_CERTIFICATE_FOOTER,
} from '../services/platformSettings';
import { storePlatformImage, PlatformImageError } from '../services/platformAssets';
import { queueOverview, retryFailedJob, retryAllFailed, cleanQueue, QUEUE_NAMES } from '../queue';
import { sendEmail } from '../services/email';
import { emailShell } from '../emails/templates';

// The super admin portal's API, for Inveon staff only. Mounted at
// /api/sa/:pathKey — the secret path segment (SUPERADMIN_PATH) must
// match or every request gets the same 404 as a route that doesn't
// exist, so the portal can't be found by probing. Then: optional IP
// allowlist, strong password + emailed code, 4-hour sessions, and an
// audit log entry for every change.

declare module 'express-serve-static-core' {
  interface Request {
    platformAdmin?: PlatformAdmin;
  }
}

export const superAdminRouter = Router({ mergeParams: true });

function notFound(res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

export function superAdminPathConfigured(): boolean {
  return (process.env.SUPERADMIN_PATH ?? '').length >= 16;
}

function pathMatches(given: string): boolean {
  const expected = process.env.SUPERADMIN_PATH ?? '';
  if (expected.length < 16) return false; // portal switched off until a long, random path is set
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function ipAllowed(ip: string | undefined): boolean {
  const list = (process.env.SUPERADMIN_ALLOWED_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return true;
  const clean = (ip ?? '').replace(/^::ffff:/, '');
  return list.includes(clean);
}

superAdminRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!pathMatches(String(req.params.pathKey ?? '')) || !ipAllowed(req.ip)) {
    notFound(res);
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Every portal request, signed in or not, shares one generous budget
// per IP; sign-in steps get a much tighter one.
superAdminRouter.use(rateLimit({ name: 'sa-all', windowSeconds: 60, max: 300 }));
const loginLimit = rateLimit({ name: 'sa-login', windowSeconds: 15 * 60, max: 10 });

function handleError(res: Response, err: unknown): boolean {
  if (err instanceof AdminAuthError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  if (err instanceof AdminNotFoundError) {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (err instanceof AdminValidationError || err instanceof BackupError || err instanceof OpsError || err instanceof PlatformImageError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}

// Wraps a handler so the known errors become clean JSON responses.
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return asyncHandler(async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (!handleError(res, err)) throw err;
    }
  });
}

superAdminRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, sessionHours: ADMIN_SESSION_HOURS });
});

superAdminRouter.post(
  '/auth/login',
  loginLimit,
  handle(async (req, res) => {
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      res.status(400).json({ error: 'Enter your email and password' });
      return;
    }
    res.json(await startAdminLogin(email, password, req.ip));
  }),
);

superAdminRouter.post(
  '/auth/verify',
  loginLimit,
  handle(async (req, res) => {
    const { email, code } = req.body as { email?: unknown; code?: unknown };
    if (typeof email !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      res.status(400).json({ error: 'Enter the 6-digit code from your email' });
      return;
    }
    res.json(await finishAdminLogin(email, code, req.ip));
  }),
);

// ---- everything below needs a signed-in admin ----
superAdminRouter.use((req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Please sign in' });
    return;
  }
  verifyAdminSession(header.slice(7))
    .then((a) => {
      req.platformAdmin = a;
      next();
    })
    .catch((err) => {
      if (!handleError(res, err)) next(err);
    });
});

const admin = (req: Request) => req.platformAdmin!;
const log = (req: Request, action: string, target: string | null, details: Record<string, unknown> | null = null) =>
  audit(admin(req), action, target, details, req.ip);
const reasonOf = (body: unknown) => {
  const r = (body as { reason?: unknown } | undefined)?.reason;
  return typeof r === 'string' && r.trim() ? r.trim().slice(0, 500) : null;
};

superAdminRouter.get('/auth/me', (req, res) => {
  const a = admin(req);
  res.json({ id: a.id, email: a.email, name: a.name, lastLoginAt: a.lastLoginAt, lastLoginIp: a.lastLoginIp });
});

superAdminRouter.post(
  '/auth/logout',
  handle(async (req, res) => {
    await log(req, 'logout', admin(req).email);
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/auth/change-password',
  handle(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'Enter your current and new password' });
      return;
    }
    const token = await changeAdminPassword(admin(req), currentPassword, newPassword);
    await log(req, 'password.changed', admin(req).email);
    res.json({ token });
  }),
);

superAdminRouter.post('/auth/password-check', (req, res) => {
  const { password } = req.body as { password?: unknown };
  res.json({ problems: adminPasswordProblems(typeof password === 'string' ? password : ''), suggestion: generateStrongPassword() });
});

// ---- admins ----
superAdminRouter.get(
  '/admins',
  handle(async (_req, res) => {
    const admins = await PlatformAdmin.findAll({
      attributes: ['id', 'email', 'name', 'active', 'lastLoginAt', 'lastLoginIp', 'lockedUntil', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    res.json({ admins });
  }),
);

superAdminRouter.post(
  '/admins',
  handle(async (req, res) => {
    const { email, name, password } = req.body as Record<string, unknown>;
    const created = await createPlatformAdmin({ email: String(email ?? ''), name: String(name ?? ''), password: String(password ?? '') });
    await log(req, 'admin.created', created.email);
    res.status(201).json({ id: created.id, email: created.email, name: created.name });
  }),
);

superAdminRouter.patch(
  '/admins/:id',
  handle(async (req, res) => {
    const target = await PlatformAdmin.findByPk(req.params.id);
    if (!target) throw new AdminNotFoundError('Admin not found');
    const { active, unlock } = req.body as { active?: unknown; unlock?: unknown };
    if (typeof active === 'boolean') {
      if (!active && target.id === admin(req).id) throw new AdminValidationError('You cannot switch off your own account');
      if (!active && (await PlatformAdmin.count({ where: { active: true } })) <= 1)
        throw new AdminValidationError('Keep at least one active admin');
      await target.update({ active });
      await log(req, active ? 'admin.enabled' : 'admin.disabled', target.email);
    }
    if (unlock === true) {
      await target.update({ lockedUntil: null, failedAttempts: 0 });
      await log(req, 'admin.unlocked', target.email);
    }
    res.json({ ok: true });
  }),
);

// ---- dashboard & lists ----
superAdminRouter.get(
  '/dashboard',
  handle(async (_req, res) => {
    res.json(await adminDashboard());
  }),
);

superAdminRouter.get(
  '/organizers',
  handle(async (req, res) => {
    res.json(await listOrganizers(req.query));
  }),
);

superAdminRouter.get(
  '/organizers/:id',
  handle(async (req, res) => {
    res.json(await organizerDetail(req.params.id));
  }),
);

superAdminRouter.post(
  '/organizers/:id/block',
  handle(async (req, res) => {
    const reason = reasonOf(req.body);
    const o = await setOrganizerBlocked(req.params.id, true, reason);
    await log(req, 'organizer.blocked', `${o.name} (${o.id})`, { reason });
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/organizers/:id/unblock',
  handle(async (req, res) => {
    const o = await setOrganizerBlocked(req.params.id, false, null);
    await log(req, 'organizer.unblocked', `${o.name} (${o.id})`);
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/users/:id/block',
  handle(async (req, res) => {
    const reason = reasonOf(req.body);
    const u = await setUserBlocked(req.params.id, true, reason);
    await log(req, 'user.blocked', u.email, { reason });
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/users/:id/unblock',
  handle(async (req, res) => {
    const u = await setUserBlocked(req.params.id, false, null);
    await log(req, 'user.unblocked', u.email);
    res.json({ ok: true });
  }),
);

superAdminRouter.get(
  '/customers',
  handle(async (req, res) => {
    res.json(await listCustomers(req.query));
  }),
);

superAdminRouter.post(
  '/customers/block',
  handle(async (req, res) => {
    const email = String((req.body as { email?: unknown }).email ?? '');
    const reason = reasonOf(req.body);
    await blockCustomer(email, reason, admin(req).email);
    await log(req, 'customer.blocked', email.toLowerCase(), { reason });
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/customers/unblock',
  handle(async (req, res) => {
    const email = String((req.body as { email?: unknown }).email ?? '');
    await unblockCustomer(email);
    await log(req, 'customer.unblocked', email.toLowerCase());
    res.json({ ok: true });
  }),
);

superAdminRouter.get(
  '/events',
  handle(async (req, res) => {
    res.json(await listEvents(req.query));
  }),
);

superAdminRouter.post(
  '/events/:id/status',
  handle(async (req, res) => {
    const { status } = req.body as { status?: unknown };
    if (status !== 'published' && status !== 'closed') throw new AdminValidationError('Status must be published or closed');
    const e = await setEventStatus(req.params.id, status);
    await log(req, status === 'closed' ? 'event.closed' : 'event.reopened', `${e.name} (${e.id})`);
    res.json({ ok: true });
  }),
);

superAdminRouter.get(
  '/bookings',
  handle(async (req, res) => {
    res.json(await listBookings(req.query));
  }),
);

superAdminRouter.get(
  '/payments',
  handle(async (req, res) => {
    res.json(await listPayments(req.query));
  }),
);

superAdminRouter.get(
  '/notifications',
  handle(async (req, res) => {
    res.json(await listNotifications(req.query));
  }),
);

superAdminRouter.get(
  '/audit',
  handle(async (req, res) => {
    res.json(await listAudit(req.query));
  }),
);

superAdminRouter.post(
  '/maintenance/purge-logs',
  handle(async (req, res) => {
    const days = Number((req.body as { olderThanDays?: unknown }).olderThanDays);
    if (!Number.isFinite(days)) throw new AdminValidationError('Enter a number of days');
    const result = await purgeLogs(days);
    await log(req, 'logs.purged', null, { olderThanDays: days, ...result });
    res.json(result);
  }),
);

// ---- queue ----
superAdminRouter.get(
  '/queue',
  handle(async (_req, res) => {
    res.json(await queueOverview());
  }),
);

function queueName(raw: string): string {
  if (!(QUEUE_NAMES as readonly string[]).includes(raw)) throw new AdminValidationError('Unknown queue');
  return raw;
}

superAdminRouter.post(
  '/queue/:queue/jobs/:jobId/retry',
  handle(async (req, res) => {
    await retryFailedJob(queueName(req.params.queue), req.params.jobId);
    await log(req, 'queue.job_retried', `${req.params.queue}/${req.params.jobId}`);
    res.json({ ok: true });
  }),
);

superAdminRouter.post(
  '/queue/:queue/retry-failed',
  handle(async (req, res) => {
    const retried = await retryAllFailed(queueName(req.params.queue));
    await log(req, 'queue.failed_retried', req.params.queue, { retried });
    res.json({ retried });
  }),
);

superAdminRouter.post(
  '/queue/:queue/clean',
  handle(async (req, res) => {
    const { type } = req.body as { type?: unknown };
    if (type !== 'failed' && type !== 'completed') throw new AdminValidationError('Choose failed or completed');
    const removed = await cleanQueue(queueName(req.params.queue), type);
    await log(req, 'queue.cleaned', req.params.queue, { type, removed });
    res.json({ removed });
  }),
);

// ---- system ----
superAdminRouter.get(
  '/system',
  handle(async (_req, res) => {
    res.json(await systemInfo());
  }),
);

superAdminRouter.get(
  '/server',
  handle(async (_req, res) => {
    res.json(await hostStatus());
  }),
);

superAdminRouter.get(
  '/server/logs/:name',
  handle(async (req, res) => {
    const lines = Number(req.query.lines) || 500;
    res.type('text/plain').send(await hostLog(req.params.name, lines));
  }),
);

superAdminRouter.post(
  '/server/actions',
  handle(async (req, res) => {
    const { action, target } = req.body as { action?: unknown; target?: unknown };
    const t = typeof target === 'string' && target ? target : null;
    const result = await requestHostAction(String(action ?? ''), t, admin(req).email);
    await log(req, `server.${String(action)}`, t, { requestId: result.id });
    res.status(202).json(result);
  }),
);

superAdminRouter.get(
  '/server/backups/:name',
  handle(async (req, res) => {
    const file = systemBackupPath(req.params.name);
    if (!fs.existsSync(file)) throw new AdminNotFoundError('Backup not found');
    await log(req, 'server.backup_downloaded', req.params.name);
    res.download(file, req.params.name);
  }),
);

// ---- backups ----
superAdminRouter.get(
  '/backups',
  handle(async (_req, res) => {
    res.json({ backups: await listBackups() });
  }),
);

let backupRunning = false;
superAdminRouter.post(
  '/backups',
  handle(async (req, res) => {
    if (backupRunning) throw new AdminValidationError('A backup is already running');
    backupRunning = true;
    try {
      const backup = await createBackup(admin(req).email);
      await log(req, 'backup.created', backup.name, { sizeBytes: backup.sizeBytes });
      res.status(201).json(backup);
    } finally {
      backupRunning = false;
    }
  }),
);

superAdminRouter.get(
  '/backups/:name',
  handle(async (req, res) => {
    const file = backupPath(req.params.name);
    if (!fs.existsSync(file)) throw new AdminNotFoundError('Backup not found');
    await log(req, 'backup.downloaded', req.params.name);
    res.download(file, req.params.name);
  }),
);

superAdminRouter.delete(
  '/backups/:name',
  handle(async (req, res) => {
    await deleteBackup(req.params.name).catch(() => {
      throw new AdminNotFoundError('Backup not found');
    });
    await log(req, 'backup.deleted', req.params.name);
    res.json({ ok: true });
  }),
);

// ---- settings: branding, invoice, certificate footer, integrations ----
superAdminRouter.get('/settings', (_req, res) => {
  res.json({
    branding: getBranding(),
    invoice: getInvoiceSettings(),
    certificateFooter: getCertificateFooter(),
    integrations: integrationView(),
    defaults: { branding: DEFAULT_BRANDING, invoice: DEFAULT_INVOICE, certificateFooter: DEFAULT_CERTIFICATE_FOOTER },
  });
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const MEDIA_URL = /^(\/api\/uploads\/[A-Za-z0-9/_.-]+|https:\/\/[^\s"'<>]+)$/;

function cleanFields<T extends object>(defaults: T, body: unknown): T {
  const input = (body ?? {}) as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const [key, def] of Object.entries(defaults)) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || v === '') {
      out[key] = def === null ? null : def;
      continue;
    }
    if (typeof v !== 'string') throw new AdminValidationError(`${key} must be text`);
    const value = v.trim().slice(0, key.toLowerCase().includes('address') || key === 'footerNote' ? 600 : 200);
    if (key.toLowerCase().endsWith('color') && !HEX.test(value)) throw new AdminValidationError(`${key} must be a colour like #0050cb`);
    if (key.toLowerCase().endsWith('url') && !MEDIA_URL.test(value))
      throw new AdminValidationError(`${key} must be an uploaded image or an https link`);
    if (key === 'supportEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))
      throw new AdminValidationError('Enter a valid support email');
    out[key] = value;
  }
  return out as T;
}

const SETTING_ROUTES = [
  { path: 'branding', key: 'branding', current: getBranding },
  { path: 'invoice', key: 'invoice', current: getInvoiceSettings },
  { path: 'certificate-footer', key: 'certificateFooter', current: getCertificateFooter },
] as const;

for (const route of SETTING_ROUTES) {
  superAdminRouter.put(
    `/settings/${route.path}`,
    handle(async (req, res) => {
      const next = cleanFields(route.current(), req.body);
      await saveSetting(route.key, next, admin(req).email);
      await log(req, `settings.${route.key}`, null, { fields: Object.keys((req.body ?? {}) as object) });
      res.json(next);
    }),
  );
}

superAdminRouter.put(
  '/settings/integrations',
  handle(async (req, res) => {
    const values = (req.body ?? {}) as Record<string, unknown>;
    const changed = await saveIntegrations(
      Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '')])),
      admin(req).email,
    );
    // Key names only — never the values.
    await log(req, 'settings.integrations', null, { changed });
    res.json({ changed, integrations: integrationView() });
  }),
);

superAdminRouter.post(
  '/settings/test-email',
  handle(async (req, res) => {
    const to = String((req.body as { to?: unknown }).to ?? admin(req).email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new AdminValidationError('Enter a valid email');
    try {
      await sendEmail({
        to,
        subject: 'Inveon Events — test email',
        html: emailShell('<p style="margin:0">This is a test email from the super admin portal. Email sending works.</p>', 'Test email'),
        kind: 'admin_test',
      });
    } catch (err) {
      throw new AdminValidationError(`Could not send: ${err instanceof Error ? err.message : String(err)}`);
    }
    await log(req, 'settings.test_email', to);
    res.json({ ok: true });
  }),
);

const imageUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });
superAdminRouter.post(
  '/settings/images',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        res
          .status(400)
          .json({
            error: err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5 MB' : 'Upload failed',
          });
        return;
      }
      next();
    });
  },
  handle(async (req, res) => {
    if (!req.file) throw new AdminValidationError('Choose an image');
    try {
      const url = await storePlatformImage(req.file.path);
      await log(req, 'settings.image_uploaded', url);
      res.status(201).json({ url });
    } finally {
      await fsp.unlink(req.file.path).catch(() => undefined);
    }
  }),
);
