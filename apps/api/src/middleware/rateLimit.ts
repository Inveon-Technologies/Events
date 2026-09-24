import { NextFunction, Request, Response, RequestHandler } from 'express';
import { redis } from '../db/redis';

export interface RateLimitOptions {
  // Distinguishes one limiter's counters from another's — two routes
  // sharing a name share a budget.
  name: string;
  windowSeconds: number;
  max: number;
  // Defaults to the client IP (see app.ts's `trust proxy`).
  keyFor?: (req: Request) => string;
  // Off by default under Jest, where one process fires hundreds of
  // requests from the same "IP"; tests that exercise the limiter itself
  // pass enabled: true explicitly.
  enabled?: boolean;
}

// Fallback for when Redis isn't connected (local dev without Redis, or
// a transient outage) — per-process, so weaker under multiple API
// processes, but far better than no limit at all. Redis is preferred
// whenever it's ready because it's shared across processes.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryIncrement(key: string, windowSeconds: number): number {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    // Opportunistic cleanup so the map can't grow without bound.
    if (memoryBuckets.size > 10_000) {
      for (const [k, b] of memoryBuckets) if (b.resetAt <= now) memoryBuckets.delete(k);
    }
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

async function increment(key: string, windowSeconds: number): Promise<number> {
  if (redis.isReady) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      return count;
    } catch {
      // Fall through to the in-memory counter rather than failing open.
    }
  }
  return memoryIncrement(key, windowSeconds);
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'test';
  const keyFor = options.keyFor ?? ((req: Request) => req.ip ?? 'unknown');

  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      next();
      return;
    }
    const key = `rl:${options.name}:${keyFor(req)}`;
    increment(key, options.windowSeconds)
      .then((count) => {
        if (count > options.max) {
          res.set('Retry-After', String(options.windowSeconds));
          res.status(429).json({ error: 'Too many requests — please wait a few minutes and try again' });
          return;
        }
        next();
      })
      .catch(next);
  };
}

// Test hook — lets a test start from a clean in-memory state.
export function resetInMemoryRateLimits(): void {
  memoryBuckets.clear();
}
