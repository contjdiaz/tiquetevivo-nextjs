-- =============================================================================
-- CONSOLIDATED FRUVER MIGRATION (035 → 039)
-- =============================================================================
-- Runs, in order, every additive migration required by the "fruver" vertical:
--   035  seed the fruver vertical (+ quote_sent WhatsApp template)
--   036  products catalog table
--   037  promotions table (banners / combos / discount codes)
--   038  quotes + frequent_lists tables
--   039  per-business fruver config columns on `businesses`
--
-- 100% idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE):
-- safe to run multiple times. Paste this whole file into the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → Run) or pipe it via psql.
--
-- NOTE: This assumes the base schema (businesses, verticals, business_users,
-- customers) already exists. It only adds the fruver-specific objects.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared updated_at trigger function (defined in schema.sql). Re-created here so
-- this consolidated file also works if run against a DB where it is missing.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 035 — Seed the "fruver" vertical
-- =============================================================================
INSERT INTO verticals (slug, name, emoji, services_default, custom_fields_default, status_flow_default, whatsapp_templates_default)
VALUES (
  'fruver',
  'Frutas y Verduras',
  '🥬',
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"status_key": "RECEIVED", "display_label": "Recibido"},
    {"status_key": "READY", "display_label": "Listo"},
    {"status_key": "DELIVERED", "display_label": "Entregado"}
  ]'::jsonb,
  '{
    "quote_sent": "🥬 *{business_name}*\n\nNueva cotización de {customer_name}:\n\n{items_text}\n\nTotal estimado: {total}\n\nResponde para confirmar disponibilidad y precio final."
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- 036 — products catalog table
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'libra', 'unidad')),
  day_price NUMERIC(12,2) NOT NULL CHECK (day_price >= 0),
  photo_url TEXT,
  is_seasonal BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_business_active_idx ON products (business_id, active);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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


-- =============================================================================
-- 037 — promotions table (banners / combos / discount codes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('banner','combo','discount_code')),
  text TEXT,
  code TEXT,
  discount_percent NUMERIC(5,2)
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  product_ids JSONB,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS promotions_active_window_idx
  ON promotions (business_id, active, starts_at, ends_at);

DROP TRIGGER IF EXISTS update_promotions_updated_at ON promotions;
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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


-- =============================================================================
-- 038 — quotes + frequent_lists tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lines JSONB,
  estimated_total NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada','convertida')),
  from_frequent_list BOOLEAN NOT NULL DEFAULT false,
  order_id UUID,
  customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS quotes_business_idx ON quotes (business_id);

CREATE TABLE IF NOT EXISTS frequent_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lines JSONB,
  customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id)
);

CREATE INDEX IF NOT EXISTS frequent_lists_business_idx ON frequent_lists (business_id);

DROP TRIGGER IF EXISTS update_frequent_lists_updated_at ON frequent_lists;
CREATE TRIGGER update_frequent_lists_updated_at
  BEFORE UPDATE ON frequent_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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


-- =============================================================================
-- 039 — per-business fruver config columns on `businesses`
-- =============================================================================
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS product_catalog_config JSONB NOT NULL DEFAULT '{"enabled": true}'::jsonb;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS promotions_config JSONB NOT NULL
  DEFAULT '{"enabled": true, "social_invite": null, "whatsapp_broadcast_invite": null}'::jsonb;

COMMENT ON COLUMN businesses.product_catalog_config IS
  'Per-business catalog configuration for the fruver vertical (e.g. { "enabled": true }). Transactional products live in the products table, not here.';

COMMENT ON COLUMN businesses.promotions_config IS
  'Per-business promotions configuration for the fruver vertical: enabled flag plus public-safe invitations (social_invite, whatsapp_broadcast_invite) rendered on the public ticket. Transactional promotions live in the promotions table.';


-- =============================================================================
-- Verification (optional): run these SELECTs after the migration to confirm.
-- =============================================================================
-- SELECT slug FROM verticals WHERE slug = 'fruver';
-- SELECT to_regclass('public.products'), to_regclass('public.promotions'),
--        to_regclass('public.quotes'), to_regclass('public.frequent_lists');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'businesses'
--     AND column_name IN ('product_catalog_config','promotions_config');
