/**
 * Minimal in-memory rate limiter (fixed window).
 *
 * Per-process only — fine for the demo/single-node deployment. In production
 * swap this for a Redis-backed limiter (REDIS_URL is already provisioned in
 * docker-compose). The env vars match .env.example:
 *   RATE_LIMIT_WINDOW_MS  (default 60000)
 *   RATE_LIMIT_MAX_REQUESTS (default 60)
 */

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60);

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(scope: string, key: string): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: bucket.resetAt - now,
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count, retryAfterMs: 0 };
}

// Periodic cleanup so the map does not grow unboundedly.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, Math.max(WINDOW_MS, 60_000));
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
