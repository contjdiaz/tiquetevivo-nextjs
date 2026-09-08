-- Migration: Per-business configuration columns for the "fruver" vertical.
--
-- Backs Requirement 1.4 (enable catalog and promotions config for a fruver
-- business) and Requirement 4.4 (social / WhatsApp broadcast invitation shown on
-- the public ticket). Follows the same JSONB config pattern already used for
-- payment_config, loyalty_config, status_flow_config and custom_fields_config on
-- the businesses table (see 031_add_payment_config.sql), keeping only vertical
-- *configuration* here — never transactional data.
--
-- Shapes:
--   product_catalog_config:
--     { "enabled": true }
--   promotions_config:
--     {
--       "enabled": true,
--       "social_invite": null,             -- text/URL inviting to social networks
--       "whatsapp_broadcast_invite": null  -- text/link inviting to a WhatsApp broadcast channel
--     }
--
-- Multi-tenant safe: columns live on the per-tenant `businesses` row (R12.3).
-- All changes are additive and idempotent: safe to run multiple times.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS product_catalog_config JSONB NOT NULL DEFAULT '{"enabled": true}'::jsonb;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS promotions_config JSONB NOT NULL
  DEFAULT '{"enabled": true, "social_invite": null, "whatsapp_broadcast_invite": null}'::jsonb;

COMMENT ON COLUMN businesses.product_catalog_config IS
  'Per-business catalog configuration for the fruver vertical (e.g. { "enabled": true }). Transactional products live in the products table, not here.';

COMMENT ON COLUMN businesses.promotions_config IS
  'Per-business promotions configuration for the fruver vertical: enabled flag plus public-safe invitations (social_invite, whatsapp_broadcast_invite) rendered on the public ticket. Transactional promotions live in the promotions table.';
