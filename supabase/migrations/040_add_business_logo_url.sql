-- Migration: business logo URL.
--
-- Guarantees the businesses.logo_url column exists on databases created before
-- this feature (the base schema.sql defines it, but no earlier migration adds
-- it, so pre-existing databases may lack the column). Idempotent and additive:
-- safe to run multiple times and does not alter RLS.
--
-- Requirements 1.5 (logo servible y referenciado de forma estable) and
-- 8.4 (migraciones aditivas e idempotentes que conservan RLS por business_id).

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
