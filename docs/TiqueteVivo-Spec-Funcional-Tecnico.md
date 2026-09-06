# TiqueteVivo — Especificación Funcional y Técnica

Última actualización: 2026-08-29

## **Resumen**
- **Propósito:** Plataforma ligera para gestión de órdenes de lavandería con venta en línea, notificaciones por WhatsApp, control administrativo y evidencias fotográficas.
- **Despliegue actual:** Frontend estático servido desde Netlify; funciones serverless en `netlify/functions`; persistencia en Supabase (Postgres). Existe un backend legacy (AWS SAM + DynamoDB) en la carpeta `Tiquete/`.

## **Actores**
- **Cliente:** crea orden, consulta estado y realiza pago.
- **Operador (negocio):** recibe órdenes, gestiona estado (recibido, en progreso, listo, entregado), confirma recepciones con fotos.
- **Administrador / Owner:** configura negocio, plantillas, revisa pagos y logs.

## **Componentes principales**
- **Frontend (public):** [public/index.html](public/index.html), [public/app.html](public/app.html), [public/tiquete.html](public/tiquete.html) y scripts en `public/js/`.
- **Netlify Functions:** backend HTTP — carpetas `netlify/functions/` incluye endpoints CRUD de órdenes, pagos y admin.
- **Supabase:** esquema y migraciones en `supabase/schema.sql` y `supabase/migrations/`.
- **Integraciones:** WOMPI (pagos), WhatsApp (Meta), Google Sheets (opcional), almacenamiento de fotos (bucket Supabase).

## **Casos de uso (resumidos)**
1. Cliente crea orden (información, fotos opcionales) → recibe `ticket_token` público.
2. Cliente inicia pago → `create-payment-intent` → gateway (WOMPI/BOLD) → webhook procesa estado.
3. Plataforma envía notificaciones WhatsApp según plantillas configuradas.
4. Operador actualiza estado y adjunta evidencias (fotos) — se registran timestamps y URLs.
5. Admin gestiona negocios, usuarios y consulta reportes/estadísticas.

## **Modelo de datos (resumen)**
- **businesses**: id (uuid), slug, name, phone, logo_url, config, active, created_at.
- **orders**: id (uuid), business_id, order_number, customer_name, customer_phone, items_text, total, paid, balance, status, ticket_token, intake_photo_url, delivery_photo_url, created_at, updated_at.
- **order_items**: id, order_id, item_type, quantity, unit_price, total_price.
- **payments**: id, order_id, gateway, gateway_transaction_id, amount, currency, status, raw_payload, created_at.
- **whatsapp_messages**: id, order_id, phone, template_name, body, meta_message_id, status, error_message, created_at.

Ver definiciones completas en: `supabase/schema.sql` y `supabase/migrations/`.

## **Variables de entorno requeridas**
- **Obligatorias (server):** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (service role), `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET` (si se usa WOMPI), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
- **Opcionales / Frontend:** `WOMPI_PUBLIC_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

Referencia de ejemplo: [ .env ](../.env) y [README.md](../README.md).

## **API — Endpoints clave (resumen + ejemplos)**
- **POST /.netlify/functions/create-order**
  - Propósito: crear nueva orden.
  - Request (JSON):
    - `business_id` (uuid), `customer_name`, `customer_phone`, `items` (array o text), `total` (numeric), `photos` (array de presigned URLs o base64 según implementación).
  - Response (201): `{ "order_id": "...", "ticket_token": "...", "public_url": "..." }`
- **POST /.netlify/functions/create-payment-intent**
  - Propósito: crear intención de pago y devolver parámetros para frontend.
  - Request: `{ order_id, amount, currency }`
  - Response: gateway-specific payload (ej. `checkout_url` o `session` object).
- **POST /.netlify/functions/payments-webhook**
  - Propósito: recibir notificaciones del gateway; valida firma y actualiza tabla `payments` y `orders`.
  - Seguridad: valida `WOMPI_EVENTS_SECRET` / HMAC del body.
- **GET /.netlify/functions/list-orders**
  - Propósito: listar órdenes (filtrado por business, status, fecha).
  - Response: paginado con `items` y metadatos.
- **POST /.netlify/functions/whatsapp-sender**
  - Propósito: enviar mensaje WhatsApp según plantilla.
  - Request: `{ order_id, template_name, variables }`.

Nota: endpoints y rutas están implementados en `netlify/functions/*.js` — generar OpenAPI de referencia como siguiente paso.

## **Autenticación y autorización**
- **Frontend público:** acceso a ticket público vía `ticket_token` (no requiere auth).
- **Admin / Operator:** login manejado por `auth-login.js` y token checks en `_admin-auth.js` (basado en Supabase/Auth o credenciales admin). Server functions usan service role key para DB operations.
- **Roles:** `superadmin|owner|operator` — permisos deben formalizarse en una matriz. Implementación parcial en `_utils.js` (`hasPermission`, `requireAuth`).

## **Pagos — reglas de negocio**
- **Flujo:** create-payment-intent → usuario paga → gateway envía webhook → endpoint valida y aplica pago.
- **Idempotencia:** los `gateway_transaction_id` se guardan y evitan doble-aplicación.
- **Estados de pago:** `PENDING`, `APPROVED`, `DECLINED`, `ERROR`, `MANUAL_REVIEW`.
- **Overpayment policy (actual):** marca `MANUAL_REVIEW` si hay sobrepago; proponer política: reembolso automático o crédito según preferencia del cliente.

## **WhatsApp — comportamiento**
- Envíos via `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`. Logs en `whatsapp_messages`.
- Plantillas deben estar aprobadas por Meta; la app usa un motor de plantillas para sustituir variables (implementado en `_template-engine.js`).

## **Fotos y almacenamiento**
- Subida mediante signed URLs (ver `_photo-storage.js`).
- Validaciones: tamaño máx, tipos mime (`image/jpeg`, `image/png`), expiración de signed URL.
- Organización de objetos: `business_id/orders/<order_id>/intake.jpg` y `.../delivery.jpg`.

## **Cron / Reactivación**
- Job `cron-reactivation` procesa cuentas/ordenes inactivas según `REACTIVATION_ENABLED` y envía reactivaciones por WhatsApp/Sheets.

## **Observabilidad y alertas (recomendado)**
- **Logs:** guardar `raw_payload` de webhooks en `payments.raw_payload` para auditoría (actualmente ya se guarda).
- **Alertas:** notificaciones para `payments` con `ERROR` o firmas inválidas; metricar tasa de `MANUAL_REVIEW`.

## **Seguridad**
- Mantener `SUPABASE_SECRET_KEY` fuera del cliente; las Netlify Functions usan service role.
- Rotar keys de pago y WhatsApp periódicamente; incluir procedimiento de revocación en runbook.

## **Gaps detectados / preguntas abiertas**
1. Confirmar política para overpayments (refund / credit / manual review).
2. Proveer ejemplos concretos de plantillas WhatsApp por evento.
3. Confirmar formato exacto de requests/response (JSON Schema) para endpoints públicos y admin.
4. Entregar credenciales sandbox para WOMPI/BOLD y WhatsApp para pruebas E2E.
5. Definir política de retención para `raw_payload` y logs.

## **Operación / Runbook mínimo**
1. Variables env: asegurar `SUPABASE_SECRET_KEY`, `WOMPI_*`, `WHATSAPP_*` en Netlify.
2. Migraciones: ejecutar SQL en `supabase/migrations/` antes de levantar entorno.
3. Despliegue: push branch → Netlify build (assets + functions) → verificar endpoints.
4. Pruebas: ejecutar suite `tests/` localmente (node + vitest) y validar webhooks con payloads de sandbox.

## **Siguientes pasos recomendados**
- Generar OpenAPI draft (endpoints + schemas) automáticamente desde `netlify/functions/` — puedo hacerlo.
- Generar ER-diagrama y una tabla de campos exportable a `docs/data-model.md` — puedo hacerlo.
- Formalizar matriz de permisos roles → acciones y añadir pruebas de integración para pagos y WhatsApp.

---
Si quieres, puedo crear el OpenAPI draft ahora o añadir la versión final del spec en `docs/TiqueteVivo-Resumen-Funcional-Tecnico.md` (reescribir/mezclar). ¿Qué prefieres como siguiente paso?
