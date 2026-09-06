# TiqueteVivo — Spec Final (Funcional y Técnico)

Última actualización: 2026-08-29

## **1. Objetivo**
Entregar una especificación completa que permita al equipo implementar, probar y operar la plataforma TiqueteVivo: gestión de órdenes de lavandería, pagos, notificaciones WhatsApp y administración.

## **2. Requisitos
**
### 2.1 Funcionales (MVP)
- RF1: Crear orden pública con datos del cliente, items y fotos opcionales.
- RF2: Generar token público `ticket_token` y URL de consulta para cliente.
- RF3: Generar intención de pago y procesar confirmación vía webhook.
- RF4: Enviar notificaciones WhatsApp por eventos (orden creada, pago recibido, estado cambiado).
- RF5: Operador/admin puede actualizar estado, subir fotos de evidencia y ver historial.
- RF6: Dashboard admin para listar órdenes, filtrar por estado/fecha/negocio.

### 2.2 No funcionales
- RNF1: Seguridad — nunca exponer `SUPABASE_SECRET_KEY` ni claves privadas en frontend.
- RNF2: Disponibilidad — endpoints críticos (webhook, create-order) apunten a funciones serverless con tiempo de respuesta < 1s en 95% de requests.
- RNF3: Escalabilidad — diseño sin estado; almacenamiento en Supabase y objetos en bucket.
- RNF4: Observabilidad — logs de pagos y webhooks guardados; métricas para `MANUAL_REVIEW` y errores de firma.
- RNF5: Compliance — cumplimiento de almacenamiento de datos personales conforme a la legislación local.

## **3. Diseño de alto nivel**

### 3.1 Arquitectura
- Frontend estático (Netlify) — páginas `public/*.html`, JS en `public/js/`.
- Backend serverless — Netlify Functions en `netlify/functions/` que usan la service role de Supabase.
- Persistencia: Supabase (Postgres) con tablas en `supabase/schema.sql`.
- Integraciones externas: WOMPI/BOLD (pagos), WhatsApp (Meta Business API), Google Sheets (opcional).

Diagrama (conceptual):

Client (browser)
  ↕ (HTTP)
  Netlify Functions (create-order, payment-intent, webhook, admin)
  ↕
  Supabase (DB + Storage)
  ↕
  External services (WOMPI, WhatsApp)

### 3.2 Componentes y responsabilidades
- `create-order.js`: valida input, crea `orders`, genera `ticket_token`, encola WhatsApp.
- `_payments.js` + `payments-webhook.js`: normaliza eventos, valida firmas y aplica transacciones a `payments` y `orders`.
- `_photo-storage.js`: presigned URL generation y validación de uploads.
- `_template-engine.js` / `_whatsapp.js`: render y envío de plantillas por WhatsApp; guarda registro en `whatsapp_messages`.
- `_utils.js`: helpers comunes, `supabaseAdmin()` y autorización admin.

### 3.3 Modelo de datos (resumen)
- `businesses`, `orders`, `order_items`, `payments`, `whatsapp_messages`, `business_users`.
- Ver `supabase/schema.sql` para columnas y constraints.

## **4. API (resumen y contrato)**
- OpenAPI draft en `docs/openapi-draft.yaml` — usar como contrato de trabajo.
- Endpoints críticos: `/create-order`, `/create-payment-intent`, `/payments-webhook`, `/list-orders`, `/orders/{order_id}`, `/whatsapp/send`, `/auth/login`, `/business/{id}/config`.

## **5. Seguridad**
- Uso de bearer JWT para admin endpoints (`auth-login` devuelve token).
- Validación HMAC/signature para webhooks (WOMPI_EVENTS_SECRET).
- Escapar y sanitizar toda entrada que se persiste o se renderiza en templates.

## **6. Reglas de negocio**
- RB1: Idempotencia por `gateway_transaction_id` en `payments`.
- RB2: Overpayment → `MANUAL_REVIEW` (revisar política: reembolso vs crédito).
- RB3: Fotos: sólo `image/jpeg`/`image/png`; máximo 5 MB; signed URL expira en 15 minutos.

## **7. Observabilidad y monitoreo**
- Logs: guardados en Supabase `payments.raw_payload` y `whatsapp_messages`.
- Métricas propuestas: pagos por estado, tasa de `MANUAL_REVIEW`, latencia de webhook.

## **8. Requerimientos operacionales**
- Variables env (Netlify): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WOMPI_*`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Migraciones: ejecutar scripts SQL en `supabase/migrations/` antes de puesta en producción.

## **9. Plan de tareas (implementación / prueba / despliegue)**

Roadmap de entrega — tareas con prioridad alta primero:

T1 — QA / Stabilización (3d)
- T1.1: Formalizar JSON Schema para `create-order` y `create-payment-intent`.
- T1.2: Añadir tests E2E para flujo: crear orden → pago sandbox → webhook → order.paid.

T2 — Seguridad y Roles (2d)
- T2.1: Definir matriz roles → acciones (owner/operator/superadmin).
- T2.2: Aplicar verificación de roles en `_utils.hasPermission` y endpoints admin.

T3 — Pagos y Reconciliación (3d)
- T3.1: Añadir tests de webhook con firmas válidas/invalidas.
- T3.2: Definir comportamiento en overpayment y documentarlo en runbook.

T4 — WhatsApp y plantillas (2d)
- T4.1: Consolidar plantillas por evento (order_created, payment_confirmed, status_changed).
- T4.2: Integrar pruebas con cuenta sandbox o simulador.

T5 — Documentación y entrega (1d)
- T5.1: Publicar `docs/openapi-draft.yaml` con UI en `docs/openapi-ui.html`.
- T5.2: Añadir `docs/data-model.md` (opcional) con ER-diagrama.

## **10. Pruebas y criterios de aceptación**
- CA1: Crear orden y recuperar public URL con `ticket_token` (manual test).
- CA2: Pagar en sandbox y que `orders.paid` se actualice automáticamente.
- CA3: Envío WhatsApp disparado y registro en `whatsapp_messages`.
- CA4: Admin login retorna token y endpoints admin requieren token.

## **11. Siguientes pasos y decisiones pendientes**
- Confirmar política de overpayment (refund/credit/manual).
- Proveer plantillas WhatsApp aprobadas.
- Entregar credenciales sandbox (WOMPI/BOLD/WhatsApp) para pruebas.

---
Si quieres, puedo ahora:
- generar `docs/data-model.md` con tabla de campos y ER-diagrama simple, o
- abrir PR con estos archivos y preparar checklist para testing E2E.
