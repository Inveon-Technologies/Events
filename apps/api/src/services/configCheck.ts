import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { redis } from '../db/redis';
import { verifyEmailLogin, isEmailConfigured } from './email';
import { checkS3Access, isS3Configured } from './s3Storage';
import { cashfreeGetOrder, CashfreeApiError, CashfreeNotConfiguredError } from './cashfreeClient';
import { whatsAppProvider } from './whatsapp/client';
import { integrationValue, cashfreeMode, platformFeePercent } from './platformSettings';
import { isQueueEnabled } from '../queue';
import { listBackups, opsDir } from './adminSystem';

// Live "is everything set up right?" check for the super admin portal.
// Every item really talks to the service where it can (SMTP login,
// Cashfree API, S3 bucket, database, Redis) rather than just checking
// that a variable is present.

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface ConfigCheckItem {
  id: string;
  group: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

async function within<T>(ms: number, p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function httpsUrl(value: string | undefined): boolean {
  return Boolean(value && /^https:\/\/[^/\s]+/.test(value));
}

async function databaseChecks(): Promise<ConfigCheckItem[]> {
  const group = 'Core';
  try {
    await within(5000, sequelize.query('SELECT 1'));
    const items: ConfigCheckItem[] = [{ id: 'db', group, label: 'Database', status: 'ok', detail: 'Connected' }];
    const rows = await sequelize.query<{ name: string }>('SELECT name FROM "SequelizeMeta"', { type: QueryTypes.SELECT });
    const applied = new Set(rows.map((r) => r.name.replace(/\.(ts|js)$/, '')));
    const dir = path.join(__dirname, '..', 'db', 'migrations');
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => /^\d+.*\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
          .map((f) => f.replace(/\.(ts|js)$/, ''))
      : [];
    const missing = files.filter((f) => !applied.has(f));
    items.push(
      missing.length
        ? {
            id: 'migrations',
            group,
            label: 'Database migrations',
            status: 'fail',
            detail: `${missing.length} not applied: ${missing.join(', ')}`,
            fix: 'docker exec events_api node dist/db/migrate.js up',
          }
        : { id: 'migrations', group, label: 'Database migrations', status: 'ok', detail: `All ${files.length} applied` },
    );
    return items;
  } catch (err) {
    return [
      {
        id: 'db',
        group,
        label: 'Database',
        status: 'fail',
        detail: (err as Error).message,
        fix: 'Check DATABASE_URL and the events-postgres container',
      },
    ];
  }
}

async function redisCheck(): Promise<ConfigCheckItem> {
  const base = { id: 'redis', group: 'Core', label: 'Redis (login codes, rate limits, queue)' };
  try {
    await within(3000, redis.ping());
    return { ...base, status: 'ok', detail: 'Connected' };
  } catch (err) {
    return { ...base, status: 'fail', detail: (err as Error).message, fix: 'Check REDIS_URL and the events-redis container' };
  }
}

async function emailCheck(): Promise<ConfigCheckItem> {
  const base = { id: 'email', group: 'Integrations', label: 'Email (SMTP login)' };
  if (!isEmailConfigured())
    return { ...base, status: 'fail', detail: 'SMTP_USER / SMTP_PASS not set', fix: 'Settings → Integrations → Email' };
  const problem = await within(10000, verifyEmailLogin()).catch((e: Error) => e.message);
  return problem
    ? { ...base, status: 'fail', detail: problem, fix: 'Use a Gmail app password (Google Account → Security → App passwords)' }
    : { ...base, status: 'ok', detail: `Logged in as ${integrationValue('SMTP_USER')}` };
}

async function cashfreeChecks(): Promise<ConfigCheckItem[]> {
  const items: ConfigCheckItem[] = [];
  const group = 'Payments';
  const mode = cashfreeMode();
  const appId = integrationValue('CASHFREE_APP_ID') ?? '';
  if (!appId || !integrationValue('CASHFREE_SECRET_KEY')) {
    items.push({
      id: 'cashfree',
      group,
      label: 'Cashfree keys',
      status: 'fail',
      detail: 'CASHFREE_APP_ID / CASHFREE_SECRET_KEY not set',
      fix: 'Settings → Integrations → Cashfree',
    });
    return items;
  }
  const looksTest = /^TEST/i.test(appId);
  if (mode === 'production' && looksTest) {
    items.push({
      id: 'cashfree-mode',
      group,
      label: 'Cashfree mode vs keys',
      status: 'fail',
      detail: 'Mode is production but the App ID is a TEST (sandbox) key',
      fix: 'Use your production App ID and Secret, or set CASHFREE_ENV=sandbox',
    });
  } else if (mode === 'sandbox' && !looksTest) {
    items.push({
      id: 'cashfree-mode',
      group,
      label: 'Cashfree mode vs keys',
      status: 'fail',
      detail: 'Mode is sandbox but the App ID looks like a production key',
      fix: 'Set CASHFREE_ENV=production (Settings → Integrations → Cashfree)',
    });
  } else {
    items.push({
      id: 'cashfree-mode',
      group,
      label: 'Cashfree mode',
      status: mode === 'production' ? 'ok' : 'warn',
      detail: mode === 'production' ? 'Production — real payments' : 'Sandbox — test payments only, no real money',
      fix: mode === 'production' ? undefined : 'Switch to production keys when you go live (docs/ops/CASHFREE.md)',
    });
  }
  // A made-up order ID: 404 means Cashfree accepted our keys; 401 means it didn't.
  const probe = `cfg-check-${crypto.randomBytes(4).toString('hex')}`;
  const label = 'Cashfree API login';
  try {
    await within(8000, cashfreeGetOrder(probe));
    items.push({ id: 'cashfree-api', group, label, status: 'ok', detail: `Keys accepted (${mode})` });
  } catch (err) {
    if (err instanceof CashfreeApiError && err.status === 404) {
      items.push({ id: 'cashfree-api', group, label, status: 'ok', detail: `Keys accepted (${mode})` });
    } else if (err instanceof CashfreeApiError && (err.status === 401 || err.status === 403)) {
      items.push({
        id: 'cashfree-api',
        group,
        label,
        status: 'fail',
        detail: `Cashfree rejected the keys (HTTP ${err.status})`,
        fix: 'Copy the App ID and Secret again from Cashfree → Developers → API keys',
      });
    } else if (err instanceof CashfreeNotConfiguredError) {
      items.push({ id: 'cashfree-api', group, label, status: 'fail', detail: 'Keys missing' });
    } else {
      items.push({ id: 'cashfree-api', group, label, status: 'warn', detail: `Could not reach Cashfree: ${(err as Error).message}` });
    }
  }
  const api = process.env.API_PUBLIC_URL;
  items.push(
    httpsUrl(api)
      ? {
          id: 'cashfree-webhook',
          group,
          label: 'Payment webhook URL',
          status: 'ok',
          detail: `${api!.replace(/\/$/, '')}/api/webhooks/cashfree`,
          fix: 'Also add this URL in Cashfree → Developers → Webhooks (payment events)',
        }
      : {
          id: 'cashfree-webhook',
          group,
          label: 'Payment webhook URL',
          status: 'fail',
          detail: 'API_PUBLIC_URL is not an https URL',
          fix: 'Set API_PUBLIC_URL=https://events.inveontechnologies.in in apps/api/.env',
        },
  );
  const fee = platformFeePercent();
  items.push({
    id: 'platform-fee',
    group,
    label: 'Platform fee',
    status: 'ok',
    detail: `${fee}% of each online payment goes to Inveon; ${100 - fee}% is split to the organizer`,
  });
  return items;
}

async function storageCheck(): Promise<ConfigCheckItem> {
  const base = { id: 's3', group: 'Integrations', label: 'Image storage' };
  if (!isS3Configured())
    return { ...base, status: 'warn', detail: 'S3 not set — images are kept on the server disk (volume /app/uploads)' };
  const problem = await within(8000, checkS3Access()).catch((e: Error) => e.message);
  return problem
    ? {
        ...base,
        status: 'fail',
        detail: `S3 bucket ${process.env.S3_BUCKET}: ${problem}`,
        fix: 'Check S3_ACCESS_KEY / S3_SECRET_KEY and the IAM policy (Get/Put/Delete on the bucket)',
      }
    : { ...base, status: 'ok', detail: `S3 bucket ${process.env.S3_BUCKET} reachable` };
}

function whatsappCheck(): ConfigCheckItem {
  const provider = whatsAppProvider();
  const base = { id: 'whatsapp', group: 'Integrations', label: 'WhatsApp' };
  return provider
    ? { ...base, status: 'ok', detail: `Provider: ${provider} (test from the server: node dist/scripts/whatsappTest.js <number>)` }
    : {
        ...base,
        status: 'warn',
        detail: 'Not set up — customers get email only',
        fix: 'Settings → Integrations → WhatsApp (docs/ops/WHATSAPP.md)',
      };
}

async function securityAndOpsChecks(): Promise<ConfigCheckItem[]> {
  const items: ConfigCheckItem[] = [];
  const group = 'Security & operations';
  const jwt = process.env.JWT_SECRET ?? '';
  items.push(
    jwt.length >= 32
      ? { id: 'jwt', group, label: 'JWT secret', status: 'ok', detail: 'Set and long enough' }
      : {
          id: 'jwt',
          group,
          label: 'JWT secret',
          status: 'fail',
          detail: 'Missing or shorter than 32 characters',
          fix: 'openssl rand -hex 32',
        },
  );
  items.push(
    process.env.SETTINGS_ENCRYPTION_KEY
      ? { id: 'enc', group, label: 'Settings encryption key', status: 'ok', detail: 'Set' }
      : {
          id: 'enc',
          group,
          label: 'Settings encryption key',
          status: 'warn',
          detail: 'Not set — falls back to JWT_SECRET (changing JWT_SECRET would then lose saved integration keys)',
          fix: 'Set SETTINGS_ENCRYPTION_KEY once (openssl rand -hex 32)',
        },
  );
  items.push(
    httpsUrl(process.env.WEB_PUBLIC_URL)
      ? { id: 'web-url', group, label: 'Public website URL', status: 'ok', detail: process.env.WEB_PUBLIC_URL! }
      : {
          id: 'web-url',
          group,
          label: 'Public website URL',
          status: 'fail',
          detail: 'WEB_PUBLIC_URL not set — ticket links in emails and WhatsApp break',
          fix: 'WEB_PUBLIC_URL=https://events.inveontechnologies.in',
        },
  );
  items.push(
    process.env.NODE_ENV === 'production'
      ? { id: 'node-env', group, label: 'Production mode', status: 'ok', detail: 'NODE_ENV=production' }
      : { id: 'node-env', group, label: 'Production mode', status: 'warn', detail: `NODE_ENV=${process.env.NODE_ENV ?? 'unset'}` },
  );
  items.push(
    process.env.RATE_LIMITS_DISABLED === 'true'
      ? {
          id: 'rate-limits',
          group,
          label: 'Rate limits',
          status: 'fail',
          detail: 'RATE_LIMITS_DISABLED=true — login and booking protection is OFF',
          fix: 'Remove RATE_LIMITS_DISABLED from apps/api/.env',
        }
      : { id: 'rate-limits', group, label: 'Rate limits', status: 'ok', detail: 'On' },
  );
  items.push(
    isQueueEnabled()
      ? { id: 'queue', group, label: 'Background job queue', status: 'ok', detail: 'On (emails and WhatsApp retry automatically)' }
      : { id: 'queue', group, label: 'Background job queue', status: 'warn', detail: 'Off — jobs run inline without retries' },
  );
  items.push(
    process.env.SUPERADMIN_ALLOWED_IPS
      ? { id: 'sa-ips', group, label: 'Portal IP allowlist', status: 'ok', detail: 'Only listed IPs can open this portal' }
      : {
          id: 'sa-ips',
          group,
          label: 'Portal IP allowlist',
          status: 'warn',
          detail: 'Any IP can reach the sign-in page (it still needs the secret path, password and emailed code)',
          fix: 'Optional: SUPERADMIN_ALLOWED_IPS=<office IP>,<home IP>',
        },
  );
  const backups = await listBackups();
  const ageDays = backups[0] ? (Date.now() - new Date(backups[0].createdAt).getTime()) / 86400_000 : null;
  items.push(
    ageDays !== null && ageDays <= 7
      ? {
          id: 'backup',
          group,
          label: 'Recent backup',
          status: 'ok',
          detail: `Last backup ${ageDays < 1 ? 'today' : `${Math.floor(ageDays)} day(s) ago`}`,
        }
      : {
          id: 'backup',
          group,
          label: 'Recent backup',
          status: 'warn',
          detail: ageDays === null ? 'No portal backup yet' : `Last backup ${Math.floor(ageDays)} days ago`,
          fix: 'Backups → Make a backup now',
        },
  );
  const status = path.join(opsDir(), 'status.json');
  const age = fs.existsSync(status) ? (Date.now() - fs.statSync(status).mtimeMs) / 1000 : null;
  items.push(
    age !== null && age < 180
      ? { id: 'agent', group, label: 'Server helper', status: 'ok', detail: `Reported ${Math.round(age)}s ago` }
      : {
          id: 'agent',
          group,
          label: 'Server helper',
          status: 'warn',
          detail: age === null ? 'Not installed' : `Last report ${Math.round(age / 60)} min ago`,
          fix: 'sudo bash /var/www/Events/scripts/server/install-admin-agent.sh',
        },
  );
  return items;
}

export async function runConfigCheck(): Promise<{ checkedAt: string; items: ConfigCheckItem[]; summary: Record<CheckStatus, number> }> {
  const groups = await Promise.all([
    databaseChecks(),
    redisCheck().then((i) => [i]),
    cashfreeChecks(),
    emailCheck().then((i) => [i]),
    storageCheck().then((i) => [i]),
    Promise.resolve([whatsappCheck()]),
    securityAndOpsChecks(),
  ]);
  const items = groups.flat();
  const summary: Record<CheckStatus, number> = { ok: 0, warn: 0, fail: 0 };
  for (const i of items) summary[i.status] += 1;
  return { checkedAt: new Date().toISOString(), items, summary };
}
