// Simple in-memory rate limiter keyed by IP + bucket name. Resets on process
// restart — fine for v1. For multi-instance production, swap with Redis.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupHandle: NodeJS.Timeout | null = null;

function ensureCleanup() {
  if (cleanupHandle) return;
  cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive for this.
  cleanupHandle.unref?.();
}

export interface RateLimitOptions {
  bucket: string;
  ip: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit(opts: RateLimitOptions): {
  allowed: boolean;
  retryAfterSec: number;
} {
  ensureCleanup();
  const key = `${opts.bucket}:${opts.ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > opts.limit) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function ipFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return '0.0.0.0';
}
