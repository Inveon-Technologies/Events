import { createApp } from './app';
import { connectRedis } from './db/redis';
import { checkAndSendEventReminders } from './services/eventReminders';
import { expireStalePendingOnlineBookings } from './services/pendingBookingExpiry';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — frequent enough that no event's real 3-hour mark is ever missed by more than this, without hammering the database

const app = createApp();

// Best-effort — routes that don't need Redis (health, login, most of the
// app) must keep working even if this fails or REDIS_URL isn't set;
// only the OTP signup flow actually depends on it, and that fails on
// its own, clearly, at the point of use if Redis isn't reachable.
connectRedis().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Redis connection failed at startup (OTP signup will not work until this is fixed):', err);
});

// No job queue exists in this codebase (no BullMQ, no cron) — this is
// deliberately the lightweight alternative: a plain interval inside
// the one long-lived server process, checking for any event that's
// now crossed into its real 3-hour-before window. Each run is
// independently best-effort (see checkAndSendEventReminders and
// sendEventReminder) and never throws out of this handler, so one bad
// run never stops the next one from happening 5 minutes later.
//
// Safe with more than one API process: each reminder is claimed with a
// conditional UPDATE before sending (see sendEventReminder), so only
// one process ever sends it.
setInterval(() => {
  checkAndSendEventReminders().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Event reminder check failed:', err);
  });
}, REMINDER_POLL_INTERVAL_MS);

// Same pattern: releases tickets held by online bookings whose payment
// never completed (see pendingBookingExpiry.ts). Every cancellation is
// a conditional UPDATE, so overlapping runs can't double-release.
const PENDING_EXPIRY_POLL_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  expireStalePendingOnlineBookings()
    .then((result) => {
      if (result.expired > 0 || result.confirmed > 0) {
        // eslint-disable-next-line no-console
        console.log(`Pending booking sweep: ${result.expired} expired, ${result.confirmed} confirmed from Cashfree`);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Pending booking expiry sweep failed:', err);
    });
}, PENDING_EXPIRY_POLL_INTERVAL_MS);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Inveon Events API listening on port ${PORT}`);
});
