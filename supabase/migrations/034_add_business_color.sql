-- Migration: business theme color.
--
-- Guarantees the businesses.color column exists on databases created before
-- the rediseño (the base schema.sql defines it, but no earlier migration adds
-- it). Idempotent: safe to run multiple times.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#18a058';