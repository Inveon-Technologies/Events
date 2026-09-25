import { Client } from 'pg';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { NotificationLog } from '../models';
import { cleanQueue, QUEUE_NAMES } from '../queue';
import { createBackup } from './adminSystem';

// The super admin portal's "dangerous" tools: a SQL console on the Events
// database and a full data reset. The routes only call these after a
// step-up (password + emailed code) and write every use to the audit log.

export class ConsoleError extends Error {}

export const SQL_MAX_ROWS = 500;
const SQL_TIMEOUT_MS = 15_000;
const SQL_MAX_LENGTH = 20_000;

export interface SqlResult {
  command: string;
  rowCount: number | null;
  fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  durationMs: number;
  mode: 'read' | 'write';
}

// Runs ONE statement. Read mode runs it in a READ ONLY transaction that is
// always rolled back; write mode commits it. The extended query protocol
// refuses more than one statement, so "SELECT 1; COMMIT; DROP …" can't
// escape the transaction.
export async function runSql(sql: string, mode: 'read' | 'write'): Promise<SqlResult> {
  const text = sql.trim();
  if (!text) throw new ConsoleError('Enter a SQL statement');
  if (text.length > SQL_MAX_LENGTH) throw new ConsoleError(`Statement is too long (max ${SQL_MAX_LENGTH} characters)`);
  if (!process.env.DATABASE_URL) throw new ConsoleError('DATABASE_URL is not set');

  const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: 'inveon-admin-console' });
  await client.connect();
  const started = Date.now();
  try {
    await client.query(mode === 'read' ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${SQL_TIMEOUT_MS}`);
    let result;
    try {
      result = await client.query({ text: text.replace(/;\s*$/, ''), queryMode: 'extended', rowMode: 'array' } as never);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const e = err as { message?: string; position?: string };
      throw new ConsoleError(`${e.message ?? String(err)}${e.position ? ` (at character ${e.position})` : ''}`);
    }
    await client.query(mode === 'write' ? 'COMMIT' : 'ROLLBACK');
    const r = result as unknown as { command: string; rowCount: number | null; fields?: { name: string }[]; rows?: unknown[][] };
    const fields = (r.fields ?? []).map((f) => f.name);
    const allRows = r.rows ?? [];
    const rows = allRows.slice(0, SQL_MAX_ROWS).map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
    return {
      command: r.command,
      rowCount: r.rowCount,
      fields,
      rows,
      truncated: allRows.length > SQL_MAX_ROWS,
      durationMs: Date.now() - started,
      mode,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function listTables(): Promise<{ name: string; rows: number; sizeBytes: number }[]> {
  const rows = await sequelize.query<{ name: string; rows: string; size: string }>(
    `SELECT c.relname AS name, c.reltuples::bigint AS rows, pg_total_relation_size(c.oid) AS size
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ name: r.name, rows: Math.max(0, Number(r.rows)), sizeBytes: Number(r.size) }));
}

// ---------- clear logs / reset ----------

export async function clearAppLogs(): Promise<{ notifications: number; jobs: number }> {
  const notifications = await NotificationLog.destroy({ where: {}, truncate: false });
  let jobs = 0;
  for (const q of QUEUE_NAMES) {
    jobs += await cleanQueue(q, 'completed').catch(() => 0);
    jobs += await cleanQueue(q, 'failed').catch(() => 0);
  }
  return { notifications, jobs };
}

// Tables a reset never empties: the portal's own admins, its settings
// (branding, keys) and audit log, and the migration history.
export const RESET_KEEP_TABLES = ['platform_admins', 'platform_settings', 'admin_audit_logs', 'SequelizeMeta'];

export const RESET_CONFIRM_PHRASE = 'DELETE ALL DATA';

// Empties every other table, after first making a backup .zip so the reset
// can be undone. Uploaded files are left alone (the portal's logo lives
// there too).
export async function resetAllData(requestedBy: string): Promise<{ backup: string; tables: string[] }> {
  const backup = await createBackup(requestedBy);
  const tables = (
    await sequelize.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      { type: QueryTypes.SELECT },
    )
  )
    .map((t) => t.name)
    .filter((t) => !RESET_KEEP_TABLES.includes(t))
    .sort();
  if (tables.length) {
    await sequelize.query(`TRUNCATE TABLE ${tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ')} RESTART IDENTITY`);
  }
  return { backup: backup.name, tables };
}
