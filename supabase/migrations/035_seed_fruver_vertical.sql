-- Migration: Seed the "fruver" vertical (fruits & vegetables store)
-- Requirements: 1.1, 1.3
--
-- Registers the fruver vertical with its default services, status flow,
-- custom fields and WhatsApp templates (including the `quote_sent` template
-- used when a customer sends a quote/cotización).
--
-- Idempotent: safe to run multiple times (ON CONFLICT (slug) DO NOTHING).

-- =============================================================================
-- Vertical definition: fruver
-- Requirement 1.1 (slug "fruver", visible name and emoji)
-- Requirement 1.3 (default WhatsApp template for the quote-sent event)
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
