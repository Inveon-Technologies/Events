import { Queue, Worker, Job, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../logger';

// Background jobs (#38): notifications (emails) and scheduled tasks
// (reminders, the unpaid-booking sweep, the next-day broadcast) run
// through BullMQ on Redis instead of inside the request or a per-process
// setInterval. What that buys:
// - requests return without waiting on PDF/QR generation or SMTP;
// - a failed send is retried with backoff instead of being logged and lost;
// - each scheduled tick runs once across every API process/server.
//
// When the queue is disabled or Redis is unreachable, a job simply runs
// inline (the previous behaviour), so an outage never drops an email.

export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

const NOTIFICATIONS_QUEUE = 'notifications';
const SCHEDULED_QUEUE = 'scheduled';

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

// Handlers live in ./jobs, which imports the services that in turn
// import this module — so it's loaded lazily, on first use, rather than
// imported at the top (which would be a load-time cycle).
let builtInJobsLoaded = false;
function getHandler(name: string): JobHandler {
  if (!builtInJobsLoaded) {
    builtInJobsLoaded = true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    require('./jobs');
  }
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for job "${name}"`);
  return handler;
}

// On by default wherever Redis is configured, except under Jest (where
// jobs run inline unless a test turns the queue on explicitly).
export function isQueueEnabled(): boolean {
  if (process.env.QUEUE_ENABLED !== undefined) return process.env.QUEUE_ENABLED === 'true';
  return Boolean(process.env.REDIS_URL) && process.env.NODE_ENV !== 'test';
}

let connection: IORedis | null = null;
let notificationsQueue: Queue | null = null;
let scheduledQueue: Queue | null = null;
const workers: Worker[] = [];

// BullMQ needs its own connection with maxRetriesPerRequest: null (see
// db/redis.ts) — separate from the app's cache/OTP client.
function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
    connection.on('error', (err) => logger.error({ err }, 'Queue Redis connection error'));
  }
  return connection;
}

function getNotificationsQueue(): Queue {
  notificationsQueue ??= new Queue(NOTIFICATIONS_QUEUE, { connection: getConnection() });
  return notificationsQueue;
}

function getScheduledQueue(): Queue {
  scheduledQueue ??= new Queue(SCHEDULED_QUEUE, { connection: getConnection() });
  return scheduledQueue;
}

function notificationJobOptions(): JobsOptions {
  return {
    attempts: 5,
    // 30s, 1m, 2m, 4m by default.
    backoff: { type: 'exponential', delay: Number(process.env.QUEUE_BACKOFF_MS) || 30_000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

async function runInline(name: string, data: Record<string, unknown>): Promise<void> {
  try {
    await getHandler(name)(data);
  } catch (err) {
    logger.error({ err, job: name }, 'Background job failed (ran inline)');
  }
}

// Fire-and-forget from request code: never throws, never blocks on the
// work itself. `jobId` de-duplicates (e.g. a webhook delivered twice
// enqueues one confirmation email).
export async function enqueueNotification(name: string, data: Record<string, unknown>, options: { jobId?: string } = {}): Promise<void> {
  getHandler(name); // fail fast on a typo, even when the queue is off
  if (!isQueueEnabled()) {
    await runInline(name, data);
    return;
  }
  try {
    await getNotificationsQueue().add(name, data, { ...notificationJobOptions(), jobId: options.jobId });
  } catch (err) {
    logger.warn({ err, job: name }, 'Queue unavailable — running job inline');
    await runInline(name, data);
  }
}

export interface ScheduledTask {
  name: string;
  everyMs: number;
}

// Starts the workers and (idempotently) registers the repeating
// schedules. Safe to call from every API process: BullMQ runs each
// scheduled tick once, on whichever worker picks it up.
export async function startQueueWorkers(scheduled: ScheduledTask[]): Promise<void> {
  const concurrency = Number(process.env.QUEUE_CONCURRENCY) || 5;

  const notificationWorker = new Worker(NOTIFICATIONS_QUEUE, async (job: Job) => getHandler(job.name)(job.data), {
    connection: getConnection(),
    concurrency,
  });
  const scheduledWorker = new Worker(SCHEDULED_QUEUE, async (job: Job) => getHandler(job.name)(job.data ?? {}), {
    connection: getConnection(),
    concurrency: 1,
  });
  for (const worker of [notificationWorker, scheduledWorker]) {
    worker.on('failed', (job, err) =>
      logger.error({ err, job: job?.name, jobId: job?.id, attemptsMade: job?.attemptsMade }, 'Background job failed'),
    );
    worker.on('error', (err) => logger.error({ err }, 'Queue worker error'));
    workers.push(worker);
  }

  const queue = getScheduledQueue();
  for (const task of scheduled) {
    // eslint-disable-next-line no-await-in-loop
    await queue.upsertJobScheduler(
      task.name,
      { every: task.everyMs },
      {
        name: task.name,
        data: {},
        opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
      },
    );
  }
  logger.info({ scheduled: scheduled.map((t) => t.name) }, 'Background job workers started');
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
  await Promise.allSettled([notificationsQueue?.close(), scheduledQueue?.close()]);
  notificationsQueue = null;
  scheduledQueue = null;
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}

// For tests / diagnostics.
export async function getNotificationsQueueForTests(): Promise<Queue> {
  return getNotificationsQueue();
}

// --- super admin portal: inspect and manage the queues ---

export const QUEUE_NAMES = [NOTIFICATIONS_QUEUE, SCHEDULED_QUEUE] as const;

function queueByName(name: string): Queue {
  if (name === NOTIFICATIONS_QUEUE) return getNotificationsQueue();
  if (name === SCHEDULED_QUEUE) return getScheduledQueue();
  throw new Error(`Unknown queue "${name}"`);
}

export interface QueueJobView {
  id: string | undefined;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  finishedOn: number | null;
  processedOn: number | null;
  // Only what identifies the job — never full payloads (they can hold
  // attendee details).
  summary: string;
}

function summarize(job: Job): QueueJobView {
  const data = (job.data ?? {}) as Record<string, unknown>;
  const summary = ['bookingId', 'bookingReference', 'eventId', 'to', 'message']
    .filter((k) => data[k] !== undefined)
    .map((k) => `${k}=${String(data[k]).slice(0, 60)}`)
    .join(' ');
  return {
    id: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn ?? null,
    processedOn: job.processedOn ?? null,
    summary,
  };
}

export async function queueOverview(): Promise<{
  enabled: boolean;
  queues: { name: string; counts: Record<string, number>; failed: QueueJobView[]; active: QueueJobView[]; waiting: QueueJobView[] }[];
  error?: string;
}> {
  if (!isQueueEnabled()) return { enabled: false, queues: [] };
  try {
    const queues = await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const q = queueByName(name);
        const [counts, failed, active, waiting] = await Promise.all([
          q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused'),
          q.getFailed(0, 24),
          q.getActive(0, 24),
          q.getWaiting(0, 24),
        ]);
        return { name, counts, failed: failed.map(summarize), active: active.map(summarize), waiting: waiting.map(summarize) };
      }),
    );
    return { enabled: true, queues };
  } catch (err) {
    return { enabled: true, queues: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function retryFailedJob(queueName: string, jobId: string): Promise<void> {
  const job = await queueByName(queueName).getJob(jobId);
  if (!job) throw new Error('Job not found');
  await job.retry();
}

export async function retryAllFailed(queueName: string): Promise<number> {
  const q = queueByName(queueName);
  const failed = await q.getFailed(0, 999);
  await Promise.all(failed.map((j) => j.retry().catch(() => undefined)));
  return failed.length;
}

export async function cleanQueue(queueName: string, type: 'failed' | 'completed'): Promise<number> {
  const removed = await queueByName(queueName).clean(0, 10_000, type);
  return removed.length;
}
