/**
 * In-memory sliding-window rate limiter for public endpoints.
 * Resets on cold start — acceptable for MVP.
 *
 * Key format: "{ip}:{endpoint}"
 */

const store = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60000
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.windowStart + windowMs < now) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  entry.count += 1;

  if (entry.count <= limit) {
    return { allowed: true };
  }

  const windowEnd = entry.windowStart + windowMs;
  const retryAfter = Math.ceil((windowEnd - now) / 1000);

  return { allowed: false, retryAfter };
}