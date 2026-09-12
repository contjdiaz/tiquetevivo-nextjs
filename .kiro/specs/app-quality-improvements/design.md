# Design — Mejoras de calidad de la app TiqueteVivo

## Overview

Este diseño detalla como cumplir los requisitos del spec, agrupados en cuatro ejes: (A) correccion de contratos y flujos criticos, (B) seguridad y escalabilidad, (C) mantenibilidad del panel, (D) UX/accesibilidad/onboarding. La estrategia prioriza cambios de bajo riesgo y retrocompatibles primero (contratos y validaciones con tests), dejando el refactor del panel y el rate limiter distribuido despues.

Arquitectura vigente relevante:
- Handlers Next.js (`route.ts`) que delegan en `impl.ts` testeable, adaptados con `netlifyHandler`.
- Utilidades compartidas en `lib/api/*` (`_utils.ts`, `_validators.ts`, `_rate-limiter.ts`, `_payments.ts`, `_vertical-config.ts`).
- Tiquete publico servido con datos sanitizados (`lib/api/public-ticket-data.ts`) e island `app/tiquete/TiqueteClient.tsx`.
- Auth y permisos por negocio via `requireAuth` / `validateAdminToken`.

## Architecture

Arquitectura de decisiones y ejes de trabajo.

### Decisiones de arquitectura

### Decision 1: contratos hacia adelante con retrocompatibilidad

Se agregara `success` a respuestas sin remover claves existentes cuando haya consumidores. Para `save-business`, la respuesta pasara de `data` plano a `{ success: true, business: data }`. Los consumidores conocidos (`app/registro/page.tsx`) se actualizan en el mismo cambio; los tests se ajustan.

Alternativa descartada: cambiar solo la UI para aceptar objeto plano. Se descarta porque estandarizar el contrato beneficia a futuros consumidores (Req 8).

### Decision 2: disponibilidad de slug con endpoint dedicado

Se creara `GET /api/check-slug?slug=<slug>` que responde `{ available: boolean }`. Es mas barato que traer todos los negocios y elimina la dependencia del filtro `q` inexistente. `list-businesses` se estandariza a `{ businesses: [...] }` para otros consumidores.

Alternativa: solo arreglar `list-businesses` a `{ businesses }`. Aceptable, pero el endpoint dedicado es mas eficiente y claro; se implementan ambos (contrato estable + endpoint especifico).

### Decision 3: redirect de pago por `ticket_token`

`create-payment-intent` ya carga la orden; se extendera el `SELECT` para incluir `ticket_token`. El `redirectUrl` usara `ticket_token` cuando exista, con fallback a `number` + `slug`.

### Decision 4: autorizacion de pago sin auth via `ticket_token`

Cuando no hay usuario autenticado, se exige `ticket_token` en el body y se compara con `order.ticket_token`. Con auth, se valida permiso sobre el negocio con `requireAuth`.

### Decision 5: rate limiter con adaptador e interfaz estable

Se mantiene la firma `checkRateLimit(key, limit, windowMs)` y se introduce un backend intercambiable. Backend por defecto para produccion: tabla Supabase `rate_limits` con TTL logico (columna `window_start`), operado con upsert atomico. El backend en memoria queda como fallback para tests/desarrollo.

## Components and Interfaces

Componentes y cambios por archivo.

### A. Contratos y flujos criticos

#### A1. `app/api/save-business/route.ts` (Req 1, 8)
- Respuesta exito: `return json(200, { success: true, business: data });`
- Respuestas de error existentes: agregar `success: false` a los `json(400, ...)` y `json(500, ...)`.

#### A2. `app/registro/page.tsx` (Req 1, 2)
- `handleRegister`: mantener la validacion `!res.ok || !data.success`; ahora navegar usando `data.business.slug` si existe.
- `checkSlug`: reemplazar por llamada a `GET /api/check-slug?slug=` y usar `dataRes.available`; manejar respuesta indefinida sin excepcion.

#### A3. Nuevo `app/api/check-slug/route.ts` + `impl.ts` (Req 2)
- `GET`, valida `slug` con `slugify`, consulta `businesses` por `slug`, responde `{ available: boolean }`.
- Rate limit por IP para evitar enumeracion.

#### A4. `app/api/list-businesses/route.ts` (Req 2, 8)
- Envolver la salida en `{ businesses }` (retrocompatibilidad: actualizar consumidores/tests que lean array plano).

#### A5. `app/api/create-payment-intent/route.ts` (Req 3, 4)
- Extender `SELECT` de la orden con `ticket_token`.
- Construir `redirectUrl` con `ticket_token` (fallback `number` + `slug`).
- Autorizacion:
  - Si `requireAuth` (sin lanzar) da usuario valido con permiso sobre `order.business_id`, permitir.
  - Si no hay auth, exigir `body.ticket_token` y comparar con `order.ticket_token`; si no coincide, `403`.
- No devolver `customer_name`/`customer_phone` en la respuesta.

#### A6. `app/api/update-order/impl.ts` (Req 5)
- Antes de fusionar `custom_fields`, invocar `validateCustomFields(body.custom_fields, businessConfig.custom_fields_config)` (misma utilidad usada en create-order).
- Si invalido, `json(400, { error: true, message, field: "custom_fields" })`.
- Si valido, fusionar valores normalizados con existentes.

#### A7. `app/api/list-orders/impl.ts` (Req 6)
- Reemplazar el `.limit(Number(...limit || 100))` por:
```ts
const rawLimit = Number(event.queryStringParameters?.limit || 100);
const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 100));
```
- Aplicar `limit` en la query (rama autenticada). La rama `ticket_token` no usa limit.

### B. Seguridad y escalabilidad

#### B1. `lib/api/_rate-limiter.ts` (Req 13)
- Extraer interfaz `RateLimitStore` con `hit(key, windowMs): { count, windowStart }`.
- Implementaciones: `MemoryStore` (actual) y `SupabaseStore` (nueva).
- `checkRateLimit` selecciona backend por config/env, manteniendo firma actual.
- Nueva migracion `supabase/migrations/*_rate_limits.sql` con tabla `rate_limits(key text pk, count int, window_start timestamptz)` y limpieza por TTL.

#### B2. CORS diferenciado (Req 14)
- Introducir helper en `lib/api/_utils.ts` (o `netlify-adapter`) que construya headers CORS segun tipo (`public` vs `private`).
- Aplicar a endpoints tocados; documentar clasificacion.

#### B3. Flujo admin (Req 16)
- Documentar en `docs/` cual login esta activo (`auth-login`).
- Verificar que endpoints `admin-*` validen `superadmin` via `validateAdminToken`; aislar/retirar `admin-login` si no se usa (marcar como deprecated primero).

### C. Mantenibilidad del panel

#### C1. Refactor `app/panel/page.tsx` (Req 9, 17)
Extraer a nuevos modulos:
- `app/panel/hooks/usePanelAuth.ts`
- `app/panel/hooks/useOrders.ts`
- `app/panel/hooks/useBusinessConfig.ts`
- `app/panel/components/OrderFormDrawer.tsx`
- `app/panel/components/QrModal.tsx`
- `app/panel/components/DeliveryPhotoModal.tsx`
- `app/panel/components/OrdersSection.tsx`
- `app/panel/components/PanelSidebar.tsx`

Estrategia: refactor por extraccion incremental preservando comportamiento. `page.tsx` queda como orquestador. Lazy load de secciones pesadas con `next/dynamic`.

Tipos de dominio (Req 17): crear `app/panel/types.ts` o `lib/types/domain.ts` con `Order`, `Business`, `BusinessConfig`, `CustomFieldValue` aplicados en las superficies tocadas.

#### C2. Consistencia de cache (Req 7)
- En los setters de ordenes, calcular `nextOrders` dentro del updater funcional (`setOrders(prev => ...)`) y persistir/derivar de `nextOrders`, nunca del `orders` capturado.
- Tras mutacion, permitir `refetch` desde servidor como fuente de verdad.

### D. UX / accesibilidad / onboarding

#### D1. Componente `Modal` accesible compartido (Req 10, 11)
- Nuevo `components/ui/Modal.tsx` con `role="dialog"`, `aria-modal`, focus trap, cierre con Escape, retorno de foco.
- Migrar QR modal, foto de entrega y cotizacion a este componente.

#### D2. `QuoteModal` reemplazando `window.prompt` (Req 10)
- Modal con input monetario validado, resumen del valor adicional y vista previa del mensaje antes de confirmar.

#### D3. Accesibilidad global (Req 11)
- `app/globals.css`: estilo `:focus-visible` consistente para botones/enlaces.
- Auditar botones con solo icono/emoji y añadir `aria-label`.
- Stepper del tiquete: añadir texto/estado que no dependa solo del color (ya hay labels; asegurar indicador textual de "actual/completado").

#### D4. Onboarding (Req 12)
- `components/onboarding/FirstRunTasks.tsx`: 3 tareas guiadas, progreso persistido (en negocio/config o preferencia de usuario en servidor; evitar depender solo de estado volatil).
- `components/onboarding/SetupChecklist.tsx`: checklist post-registro.
- Estados vacios utiles en secciones del panel.
- Microcopy en campos complejos.

## Data Models

Modelos de datos.

### Orden (respuesta publica sanitizada)
Sin cambios de esquema; se reutiliza sanitizacion existente. `create-payment-intent` deja de exponer datos de cliente.

### `rate_limits` (nueva tabla)
```sql
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);
```
Limpieza: borrar filas con `window_start < now() - interval` en un job/cron o durante `hit`.

## Flujos

### Flujo de pago (corregido)
1. Cliente en `/tiquete?ticket_token=...` pulsa pagar.
2. `TiqueteClient` -> `POST /api/create-payment-intent { order_id, ticket_token }`.
3. Endpoint valida token o auth, calcula saldo, crea checkout, arma `redirectUrl` con `ticket_token`.
4. Gateway redirige a `/tiquete?ticket_token=...&payment=complete`.
5. `TiqueteClient` detecta `payment=complete`, refresca la orden.

### Flujo de registro (corregido)
1. UI valida slug via `GET /api/check-slug`.
2. UI envia `POST /api/save-business`.
3. Endpoint responde `{ success: true, business }`.
4. UI navega a `/panel?slug=business.slug`.
5. Panel muestra `SetupChecklist` para negocio nuevo.

## Error handling

- Validaciones de entrada: `4xx` con `{ success:false, error/message, field }`.
- Autorizacion fallida: `403` sin filtrar existencia de datos sensibles.
- Errores de gateway: `502` con mensaje generico (ya presente).
- Errores inesperados: `500` con mensaje controlado; sin volcar detalles sensibles al cliente.

## Correctness Properties

### Property 1: Contratos consistentes
Ningun cambio de contrato rompe un consumidor sin actualizar tambien ese consumidor y sus tests.
**Validates: Requirements 1.4, 2.3, 8.3, 8.4**

### Property 2: Pago autorizado
`create-payment-intent` nunca crea un intent sin `ticket_token` valido (peticion anonima) o sin permiso sobre el negocio (peticion autenticada).
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 3: Limite acotado
`list-orders` nunca devuelve mas de 200 ordenes por peticion.
**Validates: Requirements 6.1, 6.3**

### Property 4: Custom fields validos
`update-order` nunca persiste `custom_fields` que no cumplan `custom_fields_config`.
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 5: Rate limit consistente
El rate limiter respeta el limite acordado aunque cambien instancias o haya cold starts.
**Validates: Requirements 13.1, 13.2, 13.3**

## Testing Strategy

- Unit/property (Vitest + fast-check) para validadores y limites (`list-orders` limit, custom_fields en update).
- Integracion (mock de Supabase, como en tests actuales) para: save-business contrato, check-slug, create-payment-intent (sin token, token invalido, token valido, autenticado), tiquete por `ticket_token` y `number+slug`.
- Rate limiter: tests de ventana/expiracion contra `MemoryStore` y contra `SupabaseStore` con doble/mocks.
- Regresion del panel: mantener/añadir tests de hooks extraidos donde sea viable.
- Gate: `npm run test` y `npm run typecheck` deben pasar.

## Riesgos y mitigaciones

- Cambio de contrato rompe consumidores no listados: mitigar con grep de usos y actualizacion de tests.
- Refactor del panel introduce regresiones: extraccion incremental, PRs pequeños, verificar tras cada extraccion.
- Rate limiter distribuido añade latencia/dependencia: mantener fallback en memoria y timeouts cortos.
- CORS mas estricto puede bloquear origenes legitimos: definir lista y validar en staging.

## Secuencia de implementacion sugerida

1. Correcciones de contrato + validaciones + tests (Req 1-6, 15 parcial). Bajo riesgo, alto valor.
2. Cache del panel (Req 7) y limite list-orders ya cubierto.
3. Accesibilidad de modales + reemplazo de prompt (Req 10, 11).
4. Onboarding y estados vacios (Req 12).
5. Refactor del panel + tipos (Req 9, 17).
6. Rate limiter distribuido + CORS + admin (Req 13, 14, 16).
