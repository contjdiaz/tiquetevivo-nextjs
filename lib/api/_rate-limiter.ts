/**
 * Sliding-window rate limiter for public endpoints.
 *
 * The limiter is split into two responsibilities:
 * - A pluggable {@link RateLimitStore} backend that owns the per-key window
 *   bookkeeping (`hit`), and
 * - {@link checkRateLimit}, which selects the backend and applies the limit.
 *
 * The public signature `checkRateLimit(key, limit, windowMs)` is kept stable
 * for existing consumers (Req 13.4). It is synchronous and backed by the
 * in-memory store. A distributed, cross-instance backend (SupabaseStore) is
 * available through the asynchronous {@link checkRateLimitAsync}, since a
 * network-backed store cannot be resolved synchronously.
 *
 * Key format: "{ip}:{endpoint}"
 */

/** Result of registering a hit against a key within its current window. */
export interface RateLimitWindow {
  /** Number of hits recorded in the current window (including this one). */
  count: number;
  /** Timestamp (ms epoch) at which the current window started. */
  windowStart: number;
}

/**
 * Backend abstraction for the rate limiter. Implementations are responsible
 * for tracking the sliding window per key and returning the current count and
 * window start after registering a hit.
 *
 * `hit` may be synchronous (e.g. {@link MemoryStore}) or asynchronous (e.g.
 * {@link SupabaseStore}, which performs a round trip to a shared table). The
 * synchronous {@link checkRateLimit} entry point only uses synchronous stores;
 * asynchronous stores are consumed via {@link checkRateLimitAsync}.
 */
export interface RateLimitStore {
  /**
   * Register a request against `key` and return the current window state.
   * If the previous window has expired (or none exists), a fresh window is
   * started with a count of 1.
   */
  hit(key: string, windowMs: number): RateLimitWindow | Promise<RateLimitWindow>;
}

/** A store whose `hit` resolves synchronously. */
export interface SyncRateLimitStore extends RateLimitStore {
  hit(key: string, windowMs: number): RateLimitWindow;
}

/**
 * In-memory sliding-window store. Resets on cold start — acceptable for
 * tests/development and used as the synchronous fallback backend.
 */
export class MemoryStore implements SyncRateLimitStore {
  private readonly store = new Map<string, RateLimitWindow>();

  hit(key: string, windowMs: number): RateLimitWindow {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.windowStart + windowMs < now) {
      const fresh: RateLimitWindow = { count: 1, windowStart: now };
      this.store.set(key, fresh);
      return fresh;
    }

    entry.count += 1;
    return entry;
  }
}

/**
 * Distributed sliding-window store backed by the Supabase `rate_limits` table.
 *
 * Each `hit` delegates to the `rate_limit_hit` Postgres function (see
 * migration `043_add_rate_limits.sql`), which performs an atomic upsert and
 * returns the resulting `count` / `window_start`. Because the read, window
 * reset and increment happen in a single statement server-side, concurrent
 * serverless instances share one consistent counter (Req 13.1, 13.2) and the
 * window resets when it expires (Req 13.3).
 *
 * `hit` is asynchronous by nature and is consumed via {@link checkRateLimitAsync}.
 */
export class SupabaseStore implements RateLimitStore {
  /**
   * @param client A Supabase client (service role). Injected so tests can pass
   *   a double; production wiring lazily creates one via `supabaseAdmin()`.
   */
  constructor(private readonly client: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }) {}

  async hit(key: string, windowMs: number): Promise<RateLimitWindow> {
    const { data, error } = await this.client.rpc("rate_limit_hit", {
      p_key: key,
      p_window_ms: windowMs
    });

    if (error) {
      throw new Error(`SupabaseStore.hit failed: ${(error as { message?: string }).message ?? String(error)}`);
    }

    // The RPC returns a set of rows (RETURNS TABLE); take the first row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error("SupabaseStore.hit returned no row");
    }

    const { count, window_start } = row as { count: number; window_start: string };
    return { count, windowStart: new Date(window_start).getTime() };
  }
}

/**
 * Synchronous fallback backend used by {@link checkRateLimit}. Kept as a
 * module-level singleton so per-key windows persist across calls within an
 * instance.
 */
const memoryStore: SyncRateLimitStore = new MemoryStore();

/**
 * Select the synchronous backend for {@link checkRateLimit}. Only a synchronous
 * store can back the stable synchronous API, so this always returns the
 * in-memory store. Distributed backends are opted into via
 * {@link checkRateLimitAsync}.
 */
function selectStore(): SyncRateLimitStore {
  return memoryStore;
}

/**
 * Whether the distributed (Supabase) backend is enabled. Controlled by env so
 * production can opt in without touching call sites.
 */
export function isDistributedRateLimitEnabled(): boolean {
  return process.env.RATE_LIMIT_BACKEND === "supabase";
}

/** Lazily-created singleton SupabaseStore (created on first async use). */
let supabaseStore: SupabaseStore | null = null;

/**
 * Select the asynchronous backend for {@link checkRateLimitAsync}. Returns the
 * SupabaseStore when the distributed backend is enabled, otherwise falls back
 * to the in-memory store so behaviour is well defined in tests/dev.
 */
async function selectAsyncStore(): Promise<RateLimitStore> {
  if (!isDistributedRateLimitEnabled()) {
    return memoryStore;
  }
  if (!supabaseStore) {
    // Imported lazily to avoid pulling the Supabase client into the sync path.
    const { supabaseAdmin } = await import("@/lib/api/_utils");
    supabaseStore = new SupabaseStore(supabaseAdmin());
  }
  return supabaseStore;
}

function evaluate(
  window: RateLimitWindow,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  if (window.count <= limit) {
    return { allowed: true };
  }

  const now = Date.now();
  const windowEnd = window.windowStart + windowMs;
  const retryAfter = Math.ceil((windowEnd - now) / 1000);

  return { allowed: false, retryAfter };
}

/**
 * Register a request and evaluate the rate limit. Synchronous and backed by the
 * in-memory store. Signature kept stable for existing consumers (Req 13.4).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60000
): { allowed: boolean; retryAfter?: number } {
  const store = selectStore();
  const window = store.hit(key, windowMs);
  return evaluate(window, limit, windowMs);
}

/**
 * Asynchronous variant that uses the configured backend (SupabaseStore when
 * enabled). Consumers that want cross-instance consistency in serverless can
 * `await checkRateLimitAsync(...)`; the result shape matches
 * {@link checkRateLimit}.
 */
export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number = 60000
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const store = await selectAsyncStore();
  const window = await store.hit(key, windowMs);
  return evaluate(window, limit, windowMs);
}
