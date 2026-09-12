-- Migration: distributed rate limiting store (Requirement 13)
--
-- Provides a shared, TTL-backed backend for the app's rate limiter so the
-- per-key window is consistent across serverless instances and cold starts
-- (Req 13.1, 13.2). The in-memory store remains the fallback for tests/dev.
--
-- Components:
--   1. Table `rate_limits(key, count, window_start)` holding one row per
--      "{ip}:{endpoint}" key.
--   2. `rate_limit_hit(p_key, p_window_ms)` — an atomic upsert that either
--      starts a fresh window (when none exists or the previous one expired,
--      Req 13.3) or increments the current window's counter, returning the
--      resulting count and window_start in a single round trip.
--   3. `rate_limit_cleanup(p_max_age)` — logical TTL cleanup that deletes rows
--      whose window is older than the given interval; callable from a cron job
--      or opportunistically.
--
-- Idempotent: safe to run multiple times.

-- =============================================================================
-- 1. rate_limits table
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key          text PRIMARY KEY,
  count        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- Supports the TTL cleanup delete (scans by window_start).
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits (window_start);

-- =============================================================================
-- 2. rate_limit_hit — atomic upsert returning the current window state
-- =============================================================================
--
-- Behaviour (mirrors MemoryStore.hit):
--   * No row, or window expired (window_start + window_ms < now) -> reset to a
--     fresh window with count = 1 and window_start = now.
--   * Otherwise -> increment count within the existing window.
-- The INSERT ... ON CONFLICT makes the read-modify-write atomic at the row
-- level, so concurrent instances cannot lose increments (Req 13.2).

CREATE OR REPLACE FUNCTION rate_limit_hit(p_key text, p_window_ms bigint)
RETURNS TABLE (count integer, window_start timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  INSERT INTO rate_limits AS rl (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET
      -- reset the window when the previous one has expired, else keep it
      window_start = CASE
        WHEN rl.window_start + make_interval(secs => p_window_ms / 1000.0) < v_now
          THEN v_now
        ELSE rl.window_start
      END,
      -- start a fresh count on reset, otherwise increment
      count = CASE
        WHEN rl.window_start + make_interval(secs => p_window_ms / 1000.0) < v_now
          THEN 1
        ELSE rl.count + 1
      END
  RETURNING rl.count, rl.window_start;
END;
$$;

-- =============================================================================
-- 3. rate_limit_cleanup — logical TTL cleanup
-- =============================================================================
--
-- Deletes windows older than p_max_age (default 1 hour). Intended to be run
-- from a scheduled job; the table stays small since keys are reused.

CREATE OR REPLACE FUNCTION rate_limit_cleanup(p_max_age interval DEFAULT interval '1 hour')
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < now() - p_max_age;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- =============================================================================
-- 4. RLS — service-role only
-- =============================================================================
--
-- The rate limiter runs server-side with the service role (supabaseAdmin),
-- which bypasses RLS. Enable RLS with no public policies so anon/authenticated
-- clients cannot read or tamper with counters.

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
