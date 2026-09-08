# Implementation Plan: fruver-catalog-quoting

## Overview

Este plan implementa la vertical "fruver" en TiqueteVivo (Next.js App Router + Supabase, TypeScript) reutilizando los bloques existentes de la plataforma. El trabajo avanza de forma incremental: primero las migraciones aditivas y los módulos puros compartidos (calculadora de cotización, publicidad, sanitización), luego los gestores de servidor (catálogo, promociones, cotizaciones), después los endpoints públicos y del panel, y finalmente el frontend público y del panel más la integración de publicidad en el tiquete. Las pruebas basadas en propiedades (fast-check) y de ejemplo (Vitest) se colocan junto a la implementación que validan.

Cada tarea construye sobre las anteriores y termina cableando la funcionalidad al sistema existente, sin dejar código huérfano.

## Tasks

- [ ] 1. Crear migraciones aditivas e idempotentes y el seed de la vertical fruver
  - [-] 1.1 Crear migración de seed de la vertical fruver
    - Crear `035_seed_fruver_vertical.sql` insertando la vertical "fruver" (slug, nombre, emoji, `services_default`, `status_flow_default`, `custom_fields_default`, `whatsapp_templates_default` con plantilla `quote_sent`) usando `ON CONFLICT (slug) DO NOTHING`
    - _Requirements: 1.1, 1.3_

  - [-] 1.2 Crear migración de la tabla products
    - Crear `036_add_products.sql` con `CREATE TABLE IF NOT EXISTS products` (columnas `id`, `business_id`, `name`, `unit` con CHECK `('kg','libra','unidad')`, `day_price` con CHECK `>= 0`, `photo_url`, `is_seasonal`, `active`, `created_at`, `updated_at`), índice `products_business_active_idx` y RLS por `business_id`
    - _Requirements: 2.1, 2.2, 2.4, 2.8, 11.3, 12.3, 12.4_

  - [-] 1.3 Crear migración de la tabla promotions
    - Crear `037_add_promotions.sql` con `CREATE TABLE IF NOT EXISTS promotions` (discriminador `type`, `text`, `code`, `discount_percent` con CHECK `[0,100]`, `product_ids` JSONB, `starts_at`, `ends_at`, `active`, CHECK `ends_at >= starts_at`), índice `promotions_active_window_idx` y RLS por `business_id`
    - _Requirements: 3.4, 3.5, 12.3, 12.4_

  - [-] 1.4 Crear migración de las tablas quotes y frequent_lists
    - Crear `038_add_quotes.sql` con `quotes` (`lines` JSONB, `estimated_total`, `status` CHECK `('enviada','convertida')`, `from_frequent_list`, `order_id`, `created_at`, `converted_at`, `customer_id` opcional) y `frequent_lists` (`lines` JSONB, `customer_id`, `UNIQUE (business_id, customer_id)`), con índices y RLS por `business_id`
    - _Requirements: 6.1, 7.1, 7.2, 7.3, 8.1, 8.6, 12.3, 12.4_

  - [-] 1.5 Crear migración de columnas de configuración fruver en businesses
    - Crear `039_add_fruver_business_config.sql` con `ADD COLUMN IF NOT EXISTS product_catalog_config JSONB` y `promotions_config JSONB` (con `social_invite` y `whatsapp_broadcast_invite`) usando defaults idempotentes
    - _Requirements: 1.4, 4.4, 12.3_

  - [x] 1.6 Escribir smoke test de idempotencia de migraciones y RLS
    - Ejecutar las migraciones nuevas dos veces verificando idempotencia y presencia de políticas RLS por tabla
    - _Requirements: 12.3, 12.4_

- [ ] 2. Implementar tipos y funciones de sanitización de datos públicos
  - [-] 2.1 Definir tipos de dominio e interfaces públicas
    - Crear `lib/fruver/types.ts` con `Product`, `Promotion`, `QuoteLine` y las interfaces `PublicProduct`, `PublicPromotion`, `PublicCombo`, `PublicDiscountCode`
    - _Requirements: 2.1, 3.1, 5.1_

  - [x] 2.2 Implementar funciones de whitelist toPublicProduct/toPublicPromotion
    - Crear `lib/fruver/sanitize.ts` con proyecciones de whitelist que excluyen `business_id`, timestamps internos y `customer_id`, siguiendo el patrón de `stripSensitiveOrderFields`
    - _Requirements: 4.6, 5.6, 10.3_

  - [x] 2.3 Escribir property test de sanitización de datos públicos
    - **Property 10: Sanitización de datos públicos (whitelist)**
    - **Validates: Requirements 4.6, 5.6, 10.3**

- [ ] 3. Implementar la calculadora pura de cotización
  - [x] 3.1 Implementar computeEstimatedTotal y sanitizeQuantities
    - Crear `lib/fruver/quote-calculator.ts` con `computeEstimatedTotal` (suma de `day_price × qty`) y `sanitizeQuantities` (excluye `qty <= 0` o no numérica, reporta rechazadas)
    - _Requirements: 5.3, 5.4_

  - [x] 3.2 Implementar reconcileFrequentList contra el catálogo actual
    - Añadir a `lib/fruver/quote-calculator.ts` la función `reconcileFrequentList` que reconstruye líneas solo para productos activos existentes, recalcula precios vigentes y reporta no disponibles
    - _Requirements: 8.2, 8.3, 8.4_

  - [x] 3.3 Escribir property test del Total_Estimado como suma ponderada
    - **Property 11: Total_Estimado como suma ponderada**
    - **Validates: Requirements 5.3**

  - [x] 3.4 Escribir property test de rechazo de cantidades inválidas
    - **Property 12: Rechazo de cantidades inválidas**
    - **Validates: Requirements 5.4**

  - [x] 3.5 Escribir property test de reconciliación de lista frecuente
    - **Property 18: Reconciliación de lista frecuente contra el catálogo actual**
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 4. Implementar validadores de catálogo y promociones
  - [x] 4.1 Implementar validadores de Producto (unidad y precio)
    - Crear `lib/fruver/validators.ts` con `validateUnit` (acepta solo `kg`/`libra`/`unidad`) y reutilizar `validateAmount` para `day_price`, devolviendo mensajes descriptivos y `field`
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 4.2 Implementar validadores de Promocion (ventana y descuento)
    - Añadir a `lib/fruver/validators.ts` `validateWindow` (`ends_at >= starts_at`) y `validateDiscountPercent` (rango cerrado [0,100]) con mensajes descriptivos
    - _Requirements: 3.4, 3.5_

  - [x] 4.3 Escribir property test de validación de Unidad_Venta
    - **Property 1: Validación de la Unidad_Venta**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 4.4 Escribir property test de validación del precio del día
    - **Property 2: Validación del precio del día**
    - **Validates: Requirements 2.4**

  - [x] 4.5 Escribir property test de validación de la ventana de validez
    - **Property 5: Validación de la ventana de validez de una Promocion**
    - **Validates: Requirements 3.4**

  - [x] 4.6 Escribir property test de validación del porcentaje de descuento
    - **Property 6: Validación del porcentaje de descuento**
    - **Validates: Requirements 3.5**

- [x] 5. Implementar la vigencia de promociones y el Renderizador_Publicidad
  - [x] 5.1 Implementar getActivePromotions
    - Crear `lib/fruver/promotions.ts` con `getActivePromotions(promotions, now)` que devuelve solo activas con `now ∈ [starts_at, ends_at]`
    - _Requirements: 3.6, 3.7_

  - [x] 5.2 Implementar buildAdvertisingBlocks
    - Crear `lib/fruver/advertising.ts` con `buildAdvertisingBlocks` que compone promociones vigentes, sección de temporada (`is_seasonal`), combos vigentes, invitación social y código de descuento vigente, devolviendo bloques vacíos/nulos cuando no hay nada vigente y usando solo datos sanitizados
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 5.3 Escribir property test de vigencia de promociones
    - **Property 7: Vigencia de promociones**
    - **Validates: Requirements 3.6, 3.7, 4.1, 4.3, 4.5**

  - [x] 5.4 Escribir property test de la sección de temporada
    - **Property 8: Sección de temporada del Renderizador_Publicidad**
    - **Validates: Requirements 4.2**

  - [x] 5.5 Escribir property test de composición sin bloques vacíos
    - **Property 9: Composición de publicidad sin bloques vacíos**
    - **Validates: Requirements 4.7**

- [~] 6. Checkpoint - Asegurar que pasan las pruebas de módulos puros
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implementar el Gestor_Catalogo (manage-products)
  - [x] 7.1 Implementar el handler y las acciones de catálogo
    - Crear `app/api/manage-products/impl.ts` con acciones `create`/`update`/`deactivate`/`list`, usando `requireAuth` con `manage_business`, validadores del catálogo, `uploadPhoto` para foto opcional, persistencia con `business_id` y `active = true`, `updated_at` en updates, y listado filtrado por `business_id`
    - Crear `app/api/manage-products/route.ts` con `export const POST = netlifyHandler(handler)`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 12.1_

  - [-] 7.2 Escribir property test de persistencia de creación de Producto
    - **Property 3: Persistencia de creación de Producto**
    - **Validates: Requirements 2.1**

  - [-] 7.3 Escribir property test de aislamiento multi-tenant en listados
    - **Property 25: Aislamiento multi-tenant**
    - **Validates: Requirements 2.9, 7.4, 9.6, 12.1, 12.2**

  - [-] 7.4 Escribir pruebas de ejemplo de manage-products
    - Probar persistencia de update con `updated_at`, desactivación conservando fila, y foto opcional (mock de `uploadPhoto`)
    - _Requirements: 2.5, 2.6, 2.7_

- [ ] 8. Implementar el Gestor_Promociones (manage-promotions)
  - [x] 8.1 Implementar el handler y las acciones de promociones
    - Crear `app/api/manage-promotions/impl.ts` con acciones `create`/`update`/`deactivate`/`list`, `requireAuth` con `manage_business`, validación de ventana y descuento, y desactivación que excluye del renderizador; reutilizar `getActivePromotions` para `list` vigente
    - Crear `app/api/manage-promotions/route.ts` con `export const POST = netlifyHandler(handler)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 12.1_

  - [-] 8.2 Escribir pruebas de ejemplo de manage-promotions
    - Probar creación de banner, combo y código de descuento con persistencia por `business_id`
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 9. Implementar el endpoint público de catálogo (public-catalog)
  - [x] 9.1 Implementar el handler GET de catálogo público
    - Crear `app/api/public-catalog/impl.ts` que valida `slug`, aplica `checkRateLimit` con `getClientIp`, resuelve el negocio con `getBusinessBySlug`, verifica vertical fruver, devuelve solo productos `active = true` y promociones vigentes pasados por `toPublicProduct`/`toPublicPromotion`
    - Crear `app/api/public-catalog/route.ts` con `export const GET = netlifyHandler(handler)`
    - _Requirements: 5.1, 5.6, 10.1, 10.2, 10.3, 10.4, 11.3_

  - [~] 9.2 Escribir property test de que el catálogo público solo expone activos
    - **Property 4: El catálogo público solo expone Productos activos**
    - **Validates: Requirements 2.7, 5.1, 11.3**

  - [~] 9.3 Escribir property test de rate limiting de ventana deslizante
    - **Property 24: Rate limiting de ventana deslizante**
    - **Validates: Requirements 10.1, 10.2**

  - [~] 9.4 Escribir prueba de ejemplo de rechazo temprano de entradas inválidas
    - Verificar que un `slug` inválido se rechaza antes de consultar la BD
    - _Requirements: 10.4_

- [ ] 10. Implementar el Gestor_Cotizaciones (submit-quote)
  - [x] 10.1 Implementar el handler POST de envío de cotización
    - Crear `app/api/submit-quote/impl.ts` que aplica `checkRateLimit`, valida líneas (`qty > 0`, `product_id` del negocio del `slug`) y teléfono opcional antes de la BD, recalcula el Total_Estimado en servidor, persiste `quote` con estado `"enviada"` y `created_at`, y ante teléfono usa `upsertCustomer(..., { incrementOrder: false })` asociando `customer_id`
    - Crear `app/api/submit-quote/route.ts` con `export const POST = netlifyHandler(handler)`
    - _Requirements: 6.1, 6.5, 7.1, 10.1, 10.4, 12.2_

  - [x] 10.2 Implementar el mensaje de WhatsApp con enlace de respaldo
    - Construir el mensaje legible (lista de productos, cantidades, Total_Estimado) con `selectTemplate`/`renderTemplate`, enviarlo con `sendWhatsAppMessage`, y ante fallo/API no disponible devolver `buildFallbackLink`; registrar con `logWhatsAppMessage`
    - _Requirements: 6.2, 6.3, 6.4_

  - [~] 10.3 Escribir property test de la cotización persistida con total recalculado
    - **Property 13: La cotización persistida refleja el total recalculado en servidor**
    - **Validates: Requirements 6.1, 7.1**

  - [~] 10.4 Escribir property test del enlace de respaldo de WhatsApp
    - **Property 14: Enlace de respaldo de WhatsApp**
    - **Validates: Requirements 6.3**

  - [~] 10.5 Escribir property test del mensaje de cotización legible y completo
    - **Property 15: Mensaje de cotización legible y completo**
    - **Validates: Requirements 6.4**

  - [~] 10.6 Escribir pruebas de ejemplo de integración de submit-quote
    - Verificar invocación de `sendWhatsAppMessage` con fallback ante error (mock WhatsApp) y `upsertCustomer` con `incrementOrder: false` (mock `_customers`)
    - _Requirements: 6.2, 6.3, 6.5_

- [~] 11. Checkpoint - Asegurar que pasan las pruebas de gestores y endpoints públicos
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implementar listas de compra frecuente (frequent-lists)
  - [-] 12.1 Implementar el handler de guardar/cargar lista frecuente
    - Crear `app/api/frequent-lists/impl.ts` con acciones `save` (persiste líneas por `business_id + phone` con `upsertCustomer` sin incrementar, único por cliente) y `load` (restaura líneas, recalcula con precios vigentes usando `reconcileFrequentList`, reporta no disponibles); rate-limited y sanitizado
    - Crear `app/api/frequent-lists/route.ts` con `export const POST = netlifyHandler(handler)`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 10.1_

  - [~] 12.2 Escribir property test de unicidad de la lista frecuente por cliente
    - **Property 19: Unicidad de la lista frecuente por cliente**
    - **Validates: Requirements 8.6**

- [ ] 13. Implementar el endpoint de administración de cotizaciones (quotes-admin)
  - [-] 13.1 Implementar el handler de listado y conversión
    - Crear `app/api/quotes-admin/impl.ts` con `list` (filtra por `business_id`) y `mark-converted` (estado `"convertida"` + `converted_at`, opcional `order_id`) sin eliminar registros, con `requireAuth` `manage_business`
    - Crear `app/api/quotes-admin/route.ts` con `export const POST = netlifyHandler(handler)`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 12.1, 12.2_

  - [~] 13.2 Escribir property test de conversión que preserva datos
    - **Property 16: La conversión preserva los datos y actualiza el estado**
    - **Validates: Requirements 7.2**

  - [~] 13.3 Escribir property test de conservación del histórico de cotizaciones
    - **Property 17: El histórico de cotizaciones se conserva**
    - **Validates: Requirements 7.5**

- [ ] 14. Implementar la analítica del piloto (fruver-analytics)
  - [x] 14.1 Implementar las funciones puras de agregación de métricas
    - Crear `lib/fruver/analytics.ts` con agregación semanal de enviadas, porcentaje de conversión con guarda anti-división por cero, conteo de recompra con lista frecuente y Total_Estimado promedio, todo aislado por `business_id`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [~] 14.2 Implementar el handler de analítica
    - Crear `app/api/fruver-analytics/impl.ts` con `requireAuth` `read`, que dado un rango devuelve las métricas usando `lib/fruver/analytics.ts` filtradas por `business_id`
    - Crear `app/api/fruver-analytics/route.ts` con `export const GET = netlifyHandler(handler)` y `POST` según aplique
    - _Requirements: 9.1, 9.6, 12.1_

  - [~] 14.3 Escribir property test de agregación semanal de cotizaciones enviadas
    - **Property 20: Agregación semanal de cotizaciones enviadas**
    - **Validates: Requirements 9.1**

  - [~] 14.4 Escribir property test del porcentaje de conversión (con caso vacío)
    - **Property 21: Porcentaje de conversión (con caso vacío)**
    - **Validates: Requirements 9.2, 9.5**

  - [~] 14.5 Escribir property test del conteo de recompra con lista frecuente
    - **Property 22: Conteo de recompra con lista frecuente**
    - **Validates: Requirements 9.3**

  - [~] 14.6 Escribir property test del Total_Estimado promedio
    - **Property 23: Total_Estimado promedio**
    - **Validates: Requirements 9.4**

- [ ] 15. Integrar la publicidad en el tiquete público
  - [x] 15.1 Componer bloques de publicidad en public-ticket-data
    - Modificar `lib/api/public-ticket-data.ts` para que, cuando `vertical_slug === "fruver"`, añada `advertising: AdvertisingBlocks` al objeto `data` usando `buildAdvertisingBlocks` con datos ya sanitizados
    - _Requirements: 4.1, 4.6, 4.7_

  - [x] 15.2 Renderizar los bloques de publicidad en el Server Component del tiquete
    - Modificar `app/tiquete/page.tsx` para renderizar los bloques de publicidad presentes (promociones, temporada, combos, invitación social, código de descuento) sin renderizar bloques vacíos
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

- [ ] 16. Implementar la página pública de catálogo y cotización
  - [x] 16.1 Implementar el Server Component de la página fruver
    - Crear `app/fruver/[slug]/page.tsx` que hace SSR del catálogo vía el endpoint público, pasa el catálogo sanitizado y promociones vigentes al Client Component y muestra el aviso explícito de que el total es estimado
    - _Requirements: 5.1, 5.5, 11.1_

  - [x] 16.2 Implementar el Client Component QuoteBuilder
    - Crear `app/fruver/[slug]/QuoteBuilder.tsx` que gestiona selección y cantidades, valida cantidad `> 0` y numérica, recalcula el Total_Estimado localmente con `lib/fruver/quote-calculator.ts` sin round-trips, y permite guardar/cargar Lista_Frecuente y enviar por WhatsApp
    - _Requirements: 5.2, 5.3, 5.4, 8.2, 8.5, 11.2_

  - [~] 16.3 Escribir pruebas de ejemplo de componente para QuoteBuilder
    - Probar recálculo local del total, rechazo de cantidad inválida y aviso de total estimado
    - _Requirements: 5.2, 5.4, 5.5, 11.2_

- [ ] 17. Implementar las vistas del panel del Dueño
  - [~] 17.1 Implementar las vistas de catálogo y promociones
    - Crear vistas en `app/panel/` para gestionar productos (CRUD) y promociones/combos/códigos, apoyándose en `manage-products` y `manage-promotions`
    - _Requirements: 2.1, 2.5, 2.7, 3.1, 3.2, 3.3, 3.6_

  - [~] 17.2 Implementar las vistas de cotizaciones y analítica
    - Crear vistas en `app/panel/` para listar cotizaciones y marcarlas como convertidas, y para visualizar la Analitica_Piloto, apoyándose en `quotes-admin` y `fruver-analytics`
    - _Requirements: 7.2, 7.4, 9.1, 9.2, 9.3, 9.4_

- [ ] 18. Cablear defaults de la vertical y repetición de pedidos
  - [~] 18.1 Verificar y cablear la aplicación de defaults de la vertical fruver
    - Asegurar que al asociar un Negocio a la vertical fruver se apliquen los defaults mediante `applyVerticalDefaults` y se habiliten `product_catalog_config`/`promotions_config`
    - _Requirements: 1.2, 1.4_

  - [~] 18.2 Escribir prueba de ejemplo de aplicación de defaults fruver
    - Verificar que `applyVerticalDefaults` aplica servicios, flujo de estados y plantillas de la vertical fruver
    - _Requirements: 1.2_

  - [~] 18.3 Escribir prueba de ejemplo de repetición de pedido desde lista frecuente
    - Verificar que cargar una Lista_Frecuente y enviarla desemboca en el flujo de `submit-quote`
    - _Requirements: 8.5_

- [~] 19. Checkpoint final - Asegurar que pasan todas las pruebas
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas unitarias, de propiedades e integración) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Las pruebas basadas en propiedades usan `fast-check` (ya instalado), con mínimo 100 iteraciones y una prueba por propiedad, etiquetadas con el formato "Feature: fruver-catalog-quoting, Property {número}".
- Las pruebas de propiedades sobre BD/servicios se ejecutan contra los módulos puros subyacentes con datos en memoria o mocks, sin I/O real.
- El lenguaje de implementación es TypeScript (Next.js App Router + Supabase), según el diseño.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "2.1"] },
    { "id": 1, "tasks": ["1.6", "2.2", "3.1", "4.1", "4.2"] },
    { "id": 2, "tasks": ["2.3", "3.2", "4.3", "4.4", "4.5", "4.6", "5.1"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "7.1", "8.1", "14.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "8.2", "9.1", "10.1", "12.1", "13.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "9.4", "10.2", "12.2", "13.2", "13.3", "14.2", "15.1"] },
    { "id": 7, "tasks": ["10.3", "10.4", "10.5", "10.6", "14.3", "14.4", "14.5", "14.6", "15.2", "16.1"] },
    { "id": 8, "tasks": ["16.2", "17.1", "17.2", "18.1"] },
    { "id": 9, "tasks": ["16.3", "18.2", "18.3"] }
  ]
}
```
