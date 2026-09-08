-- Migration: Promotions for the "fruver" vertical (banners, combos, discount codes).
--
-- Backs Requirement 3 (promotion management) and Requirement 4 (advertising blocks
-- rendered on the public ticket). A single `promotions` table uses a `type`
-- discriminator ('banner' | 'combo' | 'discount_code') so "active promotions in
-- window" can be resolved with one filter by business, status and date range.
--
-- Multi-tenant safe (`business_id`) with RLS by `business_id`, mirroring the
-- pattern from 032_add_customers.sql. All changes are additive and idempotent:
-- safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. promotions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('banner','combo','discount_code')),
  text TEXT,                                  -- banner message (R3.1)
  code TEXT,                                  -- discount_code (R3.3)
  discount_percent NUMERIC(5,2)
    CHECK (discount_percent >= 0 AND discount_percent <= 100), -- R3.5
  product_ids JSONB,                          -- combo product references (R3.2)
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)                -- validity window (R3.4)
);

-- Fast "active promotions in window" lookups per business (R3.7).
CREATE INDEX IF NOT EXISTS promotions_active_window_idx
  ON promotions (business_id, active, starts_at, ends_at);

-- updated_at trigger (reuses the shared function from schema.sql)
DROP TRIGGER IF EXISTS update_promotions_updated_at ON promotions;
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. RLS: service_role (server functions) bypasses RLS; block anon/authenticated
--    direct access. Panel reads go through authenticated functions. A member of
--    the owning business can read its own promotions.
-- =============================================================================

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own promotions" ON promotions;
CREATE POLICY "members read own promotions" ON promotions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.auth_user_id = auth.uid()
        AND bu.business_id = promotions.business_id
        AND bu.active = true
    )
  );
