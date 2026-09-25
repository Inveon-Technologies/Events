import os from 'os';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { spawn } from 'child_process';
import archiver from 'archiver';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { redis } from '../db/redis';
import { UPLOAD_DIR } from './eventMedia';
import { isS3Configured } from './s3Storage';
import { isEmailConfigured } from './email';
import { isWhatsAppConfigured, whatsAppProvider } from './whatsapp/client';
import { integrationValue, platformFeePercent, settingsLoadedAt, getBranding, getInvoiceSettings, getCertificateFooter } from './platformSettings';
import { isQueueEnabled } from '../queue';

// Technical side of the super admin portal: live health of this API
// process, the database and Redis; database backups as .zip files; and
// the server itself (Docker containers, their logs, a fixed set of
// maintenance actions) through the host helper (scripts/server/admin-agent.sh).

// ---------- health ----------

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; error?: string }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - start, value };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function systemInfo() {
  const mem = process.memoryUsage();
  const db = await timed(async () => {
    const [info] = await sequelize.query<{ version: string; size: string; connections: string }>(
      `SELECT version() AS version, pg_database_size(current_database()) AS size,
              (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections`,
      { type: QueryTypes.SELECT },
    );
    const tables = await sequelize.query<{ table: string; rows: string; bytes: string }>(
      `SELECT relname AS table, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
       FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`,
      { type: QueryTypes.SELECT },
    );
    const migrations = await sequelize.query<{ name: string }>(`SELECT name FROM "SequelizeMeta" ORDER BY name`, {
      type: QueryTypes.SELECT,
    });
    return {
      version: info.version.split(' on ')[0],
      sizeBytes: Number(info.size),
      connections: Number(info.connections),
      tables: tables.map((t) => ({ table: t.table, rows: Number(t.rows), bytes: Number(t.bytes) })),
      migrations: migrations.map((m) => m.name),
    };
  });
  const cache = await timed(async () => {
    const info = await redis.info();
    const pick = (k: string) => info.match(new RegExp(`^${k}:(.*)$`, 'm'))?.[1]?.trim() ?? null;
    return {
      version: pick('redis_version'),
      usedMemory: pick('used_memory_human'),
      connectedClients: Number(pick('connected_clients') ?? 0),
      uptimeSeconds: Number(pick('uptime_in_seconds') ?? 0),
      keys: await redis.dbSize(),
    };
  });

  return {
    api: {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? 'development',
      imageTag: process.env.EVENTS_IMAGE_TAG ?? process.env.IMAGE_TAG ?? null,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: mem.heapTotal },
      hostname: os.hostname(),
      cpus: os.cpus().length,
      loadAverage: os.loadavg(),
      systemMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      settingsLoadedAt: settingsLoadedAt()?.toISOString() ?? null,
    },
    database: db,
    redis: cache,
    integrations: {
      email: isEmailConfigured(),
      whatsapp: isWhatsAppConfigured() ? whatsAppProvider() : null,
      cashfree: Boolean(integrationValue('CASHFREE_APP_ID') && integrationValue('CASHFREE_SECRET_KEY')),
      cashfreeMode: integrationValue('CASHFREE_ENV') === 'production' ? 'production' : 'sandbox',
      s3: isS3Configured(),
      queue: isQueueEnabled(),
    },
    config: {
      platformFeePercent: platformFeePercent(),
      seatHoldMinutes: Number(process.env.SEAT_HOLD_MINUTES) || 2,
      webPublicUrl: process.env.WEB_PUBLIC_URL ?? null,
      rateLimitsDisabled: process.env.RATE_LIMITS_DISABLED === 'true',
      opsHelperConfigured: fs.existsSync(path.join(opsDir(), 'status.json')),
    },
  };
}

// ---------- backups (database + uploaded files + settings, as .zip) ----------

export function backupDir(): string {
  return process.env.ADMIN_BACKUP_DIR || path.join(process.cwd(), 'backups');
}
const BACKUP_NAME = /^inveon-backup-\d{8}T\d{6}Z(-[a-f0-9]{6})?\.zip$/;
const KEEP_BACKUPS = Number(process.env.ADMIN_BACKUP_KEEP) || 7;

export class BackupError extends Error {}

function pgDump(): NodeJS.ReadableStream & { done: Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new BackupError('DATABASE_URL is not set');
  const child = spawn('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--no-acl', url], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c: Buffer) => {
    stderr += c.toString();
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => reject(new BackupError(`pg_dump could not start: ${err.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new BackupError(`pg_dump failed: ${stderr.slice(0, 500)}`))));
  });
  return Object.assign(child.stdout, { done });
}

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  const names = await fsp.readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((n) => BACKUP_NAME.test(n))
      .map(async (name) => {
        const st = await fsp.stat(path.join(dir, name));
        return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      }),
  );
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function backupPath(name: string): string {
  if (!BACKUP_NAME.test(name)) throw new BackupError('Unknown backup');
  return path.join(backupDir(), name);
}

async function addDirectory(archive: archiver.Archiver, dir: string, prefix: string): Promise<number> {
  let count = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      count += await addDirectory(archive, full, `${prefix}${entry.name}/`);
    } else if (entry.isFile()) {
      archive.file(full, { name: `${prefix}${entry.name}` });
      count += 1;
    }
  }
  return count;
}

// A full backup of what this app owns: the database (pg_dump custom
// format, restore with scripts/restore-db.sh or pg_restore), uploaded
// files kept on this server, and the portal's settings (secrets stay
// encrypted). Images stored in S3 stay in S3 (enable bucket versioning
// there).
export async function createBackup(createdBy: string): Promise<BackupFile> {
  const dir = backupDir();
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const name = `inveon-backup-${stamp}-${crypto.randomBytes(3).toString('hex')}.zip`;
  const target = path.join(dir, name);
  const partial = `${target}.partial`;

  const out = fs.createWriteStream(partial, { mode: 0o600 });
  const archive = archiver('zip', { zlib: { level: 6 } });
  const finished = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    out.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(out);

  try {
    const dump = pgDump();
    archive.append(dump as unknown as NodeJS.ReadableStream & import('stream').Readable, { name: 'database/events.dump' });
    const settings = await sequelize.query(`SELECT key, value, updated_by, updated_at FROM platform_settings`, { type: QueryTypes.SELECT });
    archive.append(JSON.stringify(settings, null, 2), { name: 'settings/platform_settings.json' });
    const uploadCount = await addDirectory(archive, UPLOAD_DIR, 'uploads/');
    const manifest = {
      createdAt: new Date().toISOString(),
      createdBy,
      app: 'Inveon Events',
      imageTag: process.env.EVENTS_IMAGE_TAG ?? null,
      contents: {
        'database/events.dump':
          'pg_dump --format=custom. Restore: pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" database/events.dump',
        'uploads/': `${uploadCount} file(s) stored on the server (S3 images, if S3 is used, are not included)`,
        'settings/platform_settings.json': 'Portal settings; integration secrets are encrypted with SETTINGS_ENCRYPTION_KEY',
      },
    };
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: 'MANIFEST.json' });
    await archive.finalize();
    await Promise.all([finished, dump.done]);
    await fsp.rename(partial, target);
  } catch (err) {
    archive.abort();
    await fsp.unlink(partial).catch(() => undefined);
    throw err instanceof BackupError ? err : new BackupError(err instanceof Error ? err.message : String(err));
  }

  // Keep only the newest few on disk.
  const all = await listBackups();
  await Promise.all(all.slice(KEEP_BACKUPS).map((b) => fsp.unlink(path.join(dir, b.name)).catch(() => undefined)));
  const st = await fsp.stat(target);
  return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
}

export async function deleteBackup(name: string): Promise<void> {
  await fsp.unlink(backupPath(name));
}

// ---------- the server: Docker, logs, maintenance (via the host helper) ----------

export function opsDir(): string {
  return process.env.OPS_DIR || '/app/ops';
}

// Must match the helper script's own list — it re-checks everything.
export const HOST_ACTIONS = {
  truncate_container_logs: 'Empty a container’s log file (or all containers’)',
  prune_images: 'Delete Docker images no container uses',
  prune_build_cache: 'Delete the Docker build cache',
  vacuum_journal: 'Shrink the system journal to 200 MB',
  restart_container: 'Restart one container',
  system_backup: 'Full server backup (all databases, compose files, .env files, volumes) as .zip',
} as const;
export type HostAction = keyof typeof HOST_ACTIONS;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/;

export class OpsError extends Error {}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function hostStatus() {
  const dir = opsDir();
  const status = await readJson<Record<string, unknown> & { generatedAt?: string }>(path.join(dir, 'status.json'));
  const resultNames = await fsp.readdir(path.join(dir, 'results')).catch(() => [] as string[]);
  const results = (
    await Promise.all(
      resultNames
        .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
        .map(async (n) => {
          const st = await fsp.stat(path.join(dir, 'results', n)).catch(() => null);
          return st ? { n, t: st.mtimeMs } : null;
        }),
    )
  )
    .filter((x): x is { n: string; t: number } => Boolean(x))
    .sort((a, b) => b.t - a.t)
    .slice(0, 25);
  const actions = await Promise.all(results.map((r) => readJson<Record<string, unknown>>(path.join(dir, 'results', r.n))));
  const pendingNames = await fsp.readdir(path.join(dir, 'pending')).catch(() => [] as string[]);
  const pending = await Promise.all(
    pendingNames.filter((n) => /^[a-f0-9-]{36}\.json$/.test(n)).map((n) => readJson<Record<string, unknown>>(path.join(dir, 'pending', n))),
  );
  const logNames = (await fsp.readdir(path.join(dir, 'logs')).catch(() => [] as string[])).filter((n) => n.endsWith('.log'));
  const backupNames = (await fsp.readdir(path.join(dir, 'backups')).catch(() => [] as string[])).filter((n) =>
    /^[A-Za-z0-9_.-]+\.(zip|tar\.gz)$/.test(n),
  );
  const systemBackups = (
    await Promise.all(
      backupNames.map(async (name) => {
        const st = await fsp.stat(path.join(dir, 'backups', name)).catch(() => null);
        return st ? { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() } : null;
      }),
    )
  )
    .filter(Boolean)
    .sort((a, b) => b!.createdAt.localeCompare(a!.createdAt));
  const ageSeconds = status?.generatedAt ? Math.round((Date.now() - new Date(status.generatedAt).getTime()) / 1000) : null;
  return {
    connected: Boolean(status),
    stale: ageSeconds === null || ageSeconds > 180,
    ageSeconds,
    status,
    actions: actions.filter(Boolean),
    pending: pending.filter(Boolean),
    logs: logNames.map((n) => n.replace(/\.log$/, '')).sort(),
    systemBackups,
    availableActions: HOST_ACTIONS,
  };
}

export async function hostLog(name: string, lines = 500): Promise<string> {
  if (!SAFE_NAME.test(name)) throw new OpsError('Unknown log');
  const text = await fsp.readFile(path.join(opsDir(), 'logs', `${name}.log`), 'utf8').catch(() => null);
  if (text === null) throw new OpsError('No log for that container yet — is the server helper running?');
  const all = text.split('\n');
  return all.slice(-Math.max(10, Math.min(5000, lines))).join('\n');
}

// A command to run inside one container (`docker exec … sh -c`). Only
// works when the server helper was installed with ALLOW_EXEC=1; the route
// also demands a step-up.
export async function requestContainerExec(target: string, command: string, requestedBy: string): Promise<{ id: string }> {
  if (!SAFE_NAME.test(target) || target === 'all') throw new OpsError('Choose a container');
  const cmd = command.trim();
  if (!cmd || cmd.length > 2000) throw new OpsError('Enter a command (up to 2000 characters)');
  return writeRequest({ action: 'exec', target, command: cmd, requestedBy });
}

async function writeRequest(fields: Record<string, unknown>): Promise<{ id: string }> {
  const dir = path.join(opsDir(), 'requests');
  const id = crypto.randomUUID();
  const body = JSON.stringify({ id, ...fields, requestedAt: new Date().toISOString() });
  try {
    await fsp.writeFile(path.join(dir, `${id}.json`), body, { mode: 0o644, flag: 'wx' });
  } catch {
    throw new OpsError('The server helper is not installed (no requests folder). See docs/ops/SUPER_ADMIN.md.');
  }
  return { id };
}

// One host action's outcome (or null while it is still waiting/running).
export async function hostActionResult(id: string): Promise<Record<string, unknown> | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new OpsError('Unknown request');
  return readJson<Record<string, unknown>>(path.join(opsDir(), 'results', `${id}.json`));
}

export interface MetricSample {
  t: string;
  cpu: number | null;
  load1: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskPercent: number | null;
  c: Record<string, [number | null, number]>;
}

// The helper's one-a-minute samples for the portal's charts.
export async function hostMetrics(hours: number): Promise<{ samples: MetricSample[] }> {
  const text = await fsp.readFile(path.join(opsDir(), 'metrics.jsonl'), 'utf8').catch(() => '');
  const since = Date.now() - Math.max(1, Math.min(24, hours)) * 3600_000;
  const samples: MetricSample[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const s = JSON.parse(line) as MetricSample;
      if (new Date(s.t).getTime() >= since) samples.push(s);
    } catch {
      // a half-written line — skip it
    }
  }
  return { samples };
}

export async function requestHostAction(action: string, target: string | null, requestedBy: string): Promise<{ id: string }> {
  if (!(action in HOST_ACTIONS)) throw new OpsError('Unknown action');
  if ((action === 'restart_container' || action === 'truncate_container_logs') && !target) throw new OpsError('Choose a container');
  if (target !== null && target !== 'all' && !SAFE_NAME.test(target)) throw new OpsError('Bad container name');
  if (action === 'restart_container' && target === 'all') throw new OpsError('Restart one container at a time');
  return writeRequest({ action, target, requestedBy });
}

export function systemBackupPath(name: string): string {
  if (!/^[A-Za-z0-9_.-]+\.(zip|tar\.gz)$/.test(name) || name.includes('..')) throw new OpsError('Unknown backup');
  return path.join(opsDir(), 'backups', name);
}

// Summaries for the dashboard's "settings" widget.
export function brandingSummary() {
  return { branding: getBranding(), invoice: getInvoiceSettings(), certificateFooter: getCertificateFooter() };
}
