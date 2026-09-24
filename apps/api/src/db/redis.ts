import { createClient, RedisClientType } from 'redis';
import { logger } from '../logger';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  // Same reasoning as connection.ts: don't throw at import time, since
  // that would break any code path that doesn't actually need Redis in
  // environments where it isn't configured (e.g. plain CI).
  logger.warn('REDIS_URL is not set (see .env.example) — Redis calls will fail');
}

// A single shared client for now. If queue usage (BullMQ) is added later,
// give it its OWN connection rather than reusing this one — BullMQ needs
// specific connection options (maxRetriesPerRequest: null) that would be
// wrong for plain cache reads/writes on this client.
export const redis: RedisClientType = createClient({
  url: REDIS_URL ?? 'redis://unset:6379',
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

let connecting: Promise<void> | null = null;

export function connectRedis(): Promise<void> {
  if (!connecting) {
    connecting = redis.connect().then(() => undefined);
  }
  return connecting;
}
