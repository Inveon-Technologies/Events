import { createApp } from './app';
import { connectRedis } from './db/redis';
import { checkAndSendEventReminders } from './services/eventReminders';
import { expireStalePendingOnlineBookings } from './services/pendingBookingExpiry';
import { checkAndSendPostEventBroadcasts } from './services/postEventBroadcast';
import { logger } from './logger';
import { isQueueEnabled, startQueueWorkers, closeQueues } from './queue';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — frequent enough that no event's real 3-hour mark is ever missed by more than this, without hammering the database
const PENDING_EXPIRY_POLL_INTERVAL_MS = 5 * 60 * 1000;
const POST_EVENT_POLL_INTERVAL_MS = 15 * 60 * 1000;

const app = createApp();

// Best-effort — routes that don't need Redis (health, login, most of the
// app) must keep working even if this fails or REDIS_URL isn't set;
// only the OTP signup flow actually depends on it, and that fails on
// its own, clearly, at the point of use if Redis isn't reachable.
connectRedis().catch((err) => {
  logger.error({ err }, 'Redis connection failed at startup — sign-in codes and rate limits need it');
});

// Scheduled work. With Redis available it runs as BullMQ repeatable
// jobs (see queue/), so each tick runs once across every API process.
// Without it, a plain per-process interval does the same work — still
// safe with several processes, because each reminder and each expiry is
// claimed with a conditional UPDATE before anything is sent or released.
const SCHEDULED_TASKS = [
  { name: 'event-reminders', everyMs: REMINDER_POLL_INTERVAL_MS },
  { name: 'pending-booking-expiry', everyMs: PENDING_EXPIRY_POLL_INTERVAL_MS },
  { name: 'post-event-broadcast', everyMs: POST_EVENT_POLL_INTERVAL_MS },
];

const fallbackTimers: NodeJS.Timeout[] = [];

function startIntervalFallback(): void {
  fallbackTimers.push(
    setInterval(() => {
      checkAndSendEventReminders().catch((err) => {
        logger.error({ err }, 'Event reminder check failed');
      });
    }, REMINDER_POLL_INTERVAL_MS),
    setInterval(() => {
      expireStalePendingOnlineBookings()
        .then((result) => {
          if (result.expired > 0 || result.confirmed > 0) logger.info(result, 'Pending booking sweep');
        })
        .catch((err) => {
          logger.error({ err }, 'Pending booking expiry sweep failed');
        });
    }, PENDING_EXPIRY_POLL_INTERVAL_MS),
    setInterval(() => {
      checkAndSendPostEventBroadcasts().catch((err) => {
        logger.error({ err }, 'Post-event broadcast check failed');
      });
    }, POST_EVENT_POLL_INTERVAL_MS),
  );
}

if (isQueueEnabled()) {
  startQueueWorkers(SCHEDULED_TASKS).catch((err) => {
    logger.error({ err }, 'Could not start the job queue — falling back to in-process intervals');
    startIntervalFallback();
  });
} else {
  startIntervalFallback();
}

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Inveon Events API listening');
});

// Graceful shutdown (docker stop / deploy swap): stop taking requests,
// let in-flight jobs finish, then exit.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  fallbackTimers.forEach(clearInterval);
  const forceExit = setTimeout(() => process.exit(1), 25_000);
  forceExit.unref();
  server.close(() => {
    closeQueues().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
