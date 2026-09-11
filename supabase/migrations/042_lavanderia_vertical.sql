-- Migration: Lavandería vertical (generalized engine phase)
--
-- Aligns the "laundry" vertical (seeded in 003) with the "fruver" standard so
-- both verticals share the same generalized engine (public catalog /
-- advertising / submit-quote / panel) while keeping all laundry functionality:
--
--   1. Renames the vertical slug from "laundry" to "lavanderia" so the public
--      route `/lavanderia/[slug]` matches the DB slug exactly, mirroring how
--      `/fruver/[slug]` matches the "fruver" slug (Requirement 2.1).
--   2. Enriches the vertical defaults: adds the B2B launder-by-kg service, the
--      retail/B2B segment and payment-method custom fields, and a `quote_sent`
--      WhatsApp template (mirroring 035 for the service quoter flow).
--   3. Adds `quotes.vertical_slug` so the quotes/admin endpoints and the owner
--      panel can route quotes per vertical without a join (Requirement 1.1).
--   4. Backfills existing quotes to the "fruver" vertical (all quotes persisted
--      before this migration come from the fruver flow).
--
-- Idempotent: safe to run multiple times.

-- =============================================================================
-- 1. Rename the vertical slug "laundry" -> "lavanderia"
-- =============================================================================

UPDATE verticals
SET slug = 'lavanderia'
WHERE slug = 'laundry'
  AND NOT EXISTS (SELECT 1 FROM verticals WHERE slug = 'lavanderia');

-- =============================================================================
-- 2. Refresh the lavanderia vertical defaults (Requirement 2.1)
-- =============================================================================

UPDATE verticals
SET services_default = '[
    {"name": "Lavado estándar", "description": "Lavado con detergente premium", "default_price": 12000, "duration": 180, "unit": "per_kg"},
    {"name": "Planchado", "description": "Planchado profesional de prendas", "default_price": 8000, "duration": 60, "unit": "per_item"},
    {"name": "Tintorería", "description": "Limpieza especializada en seco", "default_price": 25000, "duration": 1440, "unit": "per_item"},
    {"name": "Lavado en seco", "description": "Tratamiento para prendas delicadas", "default_price": 20000, "duration": 1440, "unit": "per_item"},
    {"name": "Lavado B2B por kilo", "description": "Remisión por kilo para hoteles, clínicas y empresas", "default_price": 9500, "duration": 1440, "unit": "per_kg"}
  ]'::jsonb,
    custom_fields_default = '[
    {"field_key": "is_delicate", "display_label": "Prenda delicada", "field_type": "boolean", "required": false, "default_value": false},
    {"field_key": "rack_location", "display_label": "Ubicación en estante", "field_type": "text", "required": false, "default_value": null},
    {"field_key": "segmento", "display_label": "Segmento", "field_type": "select", "required": true, "default_value": "retail", "options": ["retail", "b2b"]},
    {"field_key": "direccion_recogida", "display_label": "Dirección de recogida / entrega", "field_type": "text", "required": false, "default_value": null},
    {"field_key": "forma_pago", "display_label": "Forma de pago", "field_type": "select", "required": false, "default_value": "Efectivo", "options": ["Efectivo", "Nequi", "Daviplata", "Transferencia", "Datáfono", "Addí"]}
  ]'::jsonb,
    status_flow_default = '[
    {"status_key": "RECEIVED", "display_label": "Recibido"},
    {"status_key": "IN_PROGRESS", "display_label": "En proceso"},
    {"status_key": "READY", "display_label": "Listo"},
    {"status_key": "DELIVERED", "display_label": "Entregado"}
  ]'::jsonb,
    whatsapp_templates_default = '{
    "order_created": "🧺 *{business_name}*\n\nHola {customer_name} 👋\nTu orden #{order_number} ha sido recibida.\n\nDetalle: {items_text}\nTotal: {total}\n\n¡Gracias por confiar en nosotros!",
    "status_ready": "✅ *{business_name}*\n\nHola {customer_name}, tu ropa está lista para recoger 👔\nOrden: #{order_number}\nSaldo: {balance}\n\n¡Te esperamos!",
    "status_delivered": "🎉 *{business_name}*\n\nHola {customer_name}, tu orden #{order_number} ha sido entregada.\n\n¡Gracias por tu preferencia!",
    "quote_sent": "🧺 *{business_name}*\n\nNueva cotización de servicios de {customer_name}:\n\n{items_text}\n\nTotal estimado: {total}\n\nResponde para confirmar el peso final y el precio."
  }'::jsonb,
    emoji = '🧺'
WHERE slug = 'lavanderia';

-- =============================================================================
-- 3. quotes.vertical_slug (Requirement 1.1, phase engine routing)
-- =============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vertical_slug TEXT;

-- All quotes persisted before this migration come from the fruver flow.
UPDATE quotes SET vertical_slug = 'fruver' WHERE vertical_slug IS NULL;