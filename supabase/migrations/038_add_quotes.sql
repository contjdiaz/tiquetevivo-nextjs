-- Migration: Quotes and frequent lists for the "fruver" vertical.
--
-- Backs Requirement 6 (build a cart/quote from the public catalog), Requirement 7
-- (send a quote to the business and later convert it into an order without
-- deleting the record) and Requirement 8 (frequent shopping lists reused across
-- visits). Two tables:
--
--   * `quotes`          — a submitted cart with line items (JSONB) and an
--                         estimated total; its lifecycle is 'enviada' ->
--                         'convertida' (never deleted, R7.5).
--   * `frequent_lists`  — a reusable shopping list per (business, customer);
--                         UNIQUE (business_id, customer_id) enforces one list
--                         per customer so it can be upserted (R8.1, R8.6).
--
-- Multi-tenant safe (`business_id`) with RLS by `business_id`, mirroring the
-- pattern from 032_add_customers.sql / 036_add_products.sql. All changes are
-- additive and idempotent: safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. quotes table
-- =============================================================================

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lines JSONB,                                   -- cart line items (R6.1)
  estimated_total NUMERIC(12,2),                 -- estimated total (R6.1)
  status TEXT NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada','convertida')),  -- lifecycle (R7.1, R7.3)
  from_frequent_list BOOLEAN NOT NULL DEFAULT false, -- provenance (R8.6)
  order_id UUID,                                 -- set on conversion (R7.3)
  customer_id UUID,                              -- optional (R7.2)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ                        -- set on conversion (R7.3)
);

-- Fast listing of quotes per business (operator panel, R7.2).
CREATE INDEX IF NOT EXISTS quotes_business_idx ON quotes (business_id);

-- =============================================================================
-- 2. frequent_lists table
-- =============================================================================

CREATE TABLE IF NOT EXISTS frequent_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lines JSONB,                                   -- saved line items (R8.1)
  customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id)              -- one list per customer (R8.1)
);

-- Fast lookups of frequent lists per business.
CREATE INDEX IF NOT EXISTS frequent_lists_business_idx ON frequent_lists (business_id);

-- updated_at trigger (reuses the shared function from schema.sql).
DROP TRIGGER IF EXISTS update_frequent_lists_updated_at ON frequent_lists;
CREATE TRIGGER update_frequent_lists_updated_at
  BEFORE UPDATE ON frequent_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. Row Level Security (per business_id)
-- =============================================================================
-- service_role (Netlify Functions / Supabase admin client) bypasses RLS; block
-- anon/authenticated direct access. Panel reads go through the authenticated
-- functions. A member of the owning business can read its own rows. Mirrors the
-- pattern from 032_add_customers.sql.
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own quotes" ON quotes;
CREATE POLICY "members read own quotes" ON quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.auth_user_id = auth.uid()
        AND bu.business_id = quotes.business_id
        AND bu.active = true
    )
  );

ALTER TABLE frequent_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own frequent_lists" ON frequent_lists;
CREATE POLICY "members read own frequent_lists" ON frequent_lists
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.auth_user_id = auth.uid()
        AND bu.business_id = frequent_lists.business_id
        AND bu.active = true
    )
  );
