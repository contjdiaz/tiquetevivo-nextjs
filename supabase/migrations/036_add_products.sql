-- Migration: Products catalog for the "fruver" vertical.
--
-- Introduces a `products` table so a fruver business (e.g. Fruver Patty) can
-- maintain a catalog of fruits/vegetables with a "price of the day". Unlike
-- semi-static services (stored in JSONB), a fruver catalog can reach ~200
-- products with prices that change daily, so a dedicated relational table with
-- an index by (business_id, active) enables efficient reads and point updates.
--
-- All changes are additive and multi-tenant safe (every row carries business_id).
--
-- Idempotent: safe to run multiple times.

-- =============================================================================
-- 1. products table
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'libra', 'unidad')),   -- R2.2
  day_price NUMERIC(12,2) NOT NULL CHECK (day_price >= 0),        -- R2.4
  photo_url TEXT,
  is_seasonal BOOLEAN NOT NULL DEFAULT false,                    -- R2.8
  active BOOLEAN NOT NULL DEFAULT true,                          -- R2.1
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups of active products per business (public catalog query, R11.3).
CREATE INDEX IF NOT EXISTS products_business_active_idx ON products (business_id, active);

-- updated_at trigger (reuses the shared function from schema.sql).
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. Row Level Security (per business_id)
-- =============================================================================
-- service_role (Netlify Functions / Supabase admin client) bypasses RLS; block
-- anon/authenticated direct access. Operator-panel reads go through the
-- authenticated functions. Mirrors the pattern from 032_add_customers.sql.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own products" ON products;
CREATE POLICY "members read own products" ON products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.auth_user_id = auth.uid()
        AND bu.business_id = products.business_id
        AND bu.active = true
    )
  );
