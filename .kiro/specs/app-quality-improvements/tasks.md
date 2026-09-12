# Implementation Plan — Mejoras de calidad de la app TiqueteVivo

## Overview

Plan de implementacion incremental. Se priorizan correcciones de contrato y validaciones (bajo riesgo, alto valor), luego UX/accesibilidad/onboarding, y por ultimo el refactor del panel y la infraestructura de rate limiting/CORS. Los sub-tasks de test marcados con `*` son opcionales y pueden omitirse para un MVP mas rapido; las property-based tests validan las Correctness Properties del diseño.

## Tasks

- [x] 1. Corregir contrato de registro de negocio
- [x] 1.1 Actualizar `save-business` para devolver `{ success: true, business }` y agregar `success:false` a errores
  - Editar `app/api/save-business/route.ts` (respuesta 200 y ramas 400/500)
  - _Requirements: 1.1, 1.2, 1.5, 8.2_
- [x] 1.2 Ajustar `app/registro/page.tsx` para navegar con `data.business.slug`
  - Mantener validacion `!res.ok || !data.success`
  - _Requirements: 1.3_
- [ ]* 1.3 Actualizar/crear tests de integracion de `save-business` al nuevo contrato
  - Cubrir exito (`success: true` + `business`) y error (`success: false` + `message`)
  - _Requirements: 1.4, 15.1, 15.5_

- [x] 2. Estandarizar disponibilidad de slug
- [x] 2.1 Crear endpoint `app/api/check-slug/route.ts` + `impl.ts` que responde `{ available }`
  - Validar slug con `slugify`, consultar `businesses`, aplicar rate limit por IP
  - _Requirements: 2.1, 2.2_
- [x] 2.2 Estandarizar `list-businesses` a `{ businesses: [...] }`
  - Actualizar consumidores y tests que lean array plano
  - _Requirements: 2.1, 8.3_
- [x] 2.3 Reemplazar `checkSlug` en `app/registro/page.tsx` para usar `/api/check-slug` con manejo seguro de respuesta indefinida
  - _Requirements: 2.3, 2.4, 2.5_
- [ ]* 2.4 Tests de integracion para `check-slug` (disponible/ocupado/slug invalido)
  - _Requirements: 2.4, 2.5, 15.1, 15.5_
- [ ]* 2.5 Property test de consistencia de contratos tras el cambio de forma de respuesta
  - **Property 1: Contratos consistentes**
  - **Validates: Requirements 1.4, 2.3, 8.3, 8.4**

- [ ] 3. Corregir retorno y autorizacion de pago
- [x] 3.1 Extender `SELECT` de la orden en `create-payment-intent` para incluir `ticket_token`
  - _Requirements: 3.1, 3.3_
- [x] 3.2 Construir `redirectUrl` con `ticket_token` (fallback `number`+`slug`) y `payment=complete`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
- [x] 3.3 Autorizacion: exigir y validar `ticket_token` sin auth; validar permisos con `requireAuth` si hay auth; devolver `403` si no coincide
  - No exponer `customer_name`/`customer_phone` en la respuesta
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] 3.4 Verificar que `TiqueteClient` refresca la orden al detectar `payment=complete`
  - _Requirements: 3.2, 3.4_
- [ ]* 3.5 Tests de integracion de pago: sin token, token invalido, token valido, usuario autorizado; y retorno a URL valida
  - _Requirements: 4.5, 15.2, 15.3, 15.5_
- [ ]* 3.6 Property test de autorizacion de pago
  - **Property 2: Pago autorizado** — nunca crea intent sin `ticket_token` valido (anonimo) o sin permiso (autenticado)
  - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 4. Revalidar `custom_fields` en update-order
- [x] 4.1 Invocar `validateCustomFields` contra `businessConfig.custom_fields_config` antes de fusionar en `app/api/update-order/impl.ts`
  - Rechazar requeridos vacios, opciones fuera de catalogo y tipos invalidos
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
- [ ]* 4.2 Tests de update con custom_fields validos e invalidos
  - _Requirements: 5.6, 15.4, 15.5_
- [ ]* 4.3 Property test de validacion de custom_fields en update
  - **Property 4: Custom fields validos** — `update-order` nunca persiste `custom_fields` que no cumplan `custom_fields_config`
  - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [ ] 5. Acotar `limit` en list-orders
- [x] 5.1 Aplicar `limit = min(200, max(1, valido || 100))` en `app/api/list-orders/impl.ts`
  - _Requirements: 6.1, 6.2, 6.3_
- [ ]* 5.2 Tests de limite: bajo, sobre maximo, no numerico
  - _Requirements: 6.4, 15.5_
- [ ]* 5.3 Property test de cota de limite
  - **Property 3: Limite acotado** — `list-orders` nunca devuelve mas de 200 ordenes por peticion
  - **Validates: Requirements 6.1, 6.3**

- [x] 6. Consistencia de cache local en el panel
- [x] 6.1 Migrar setters de ordenes a updater funcional y persistir/derivar de `nextOrders`
  - _Requirements: 7.1, 7.2_
- [x] 6.2 Permitir refetch desde servidor tras mutacion como fuente de verdad
  - _Requirements: 7.3, 7.4_

- [x] 7. Componente Modal accesible y reemplazo de prompt
- [x] 7.1 Crear `components/ui/Modal.tsx` accesible (role dialog, aria-modal, focus trap, Escape, retorno de foco)
  - _Requirements: 11.1_
- [x] 7.2 Crear `QuoteModal` con input monetario validado + vista previa del mensaje, reemplazando `window.prompt`
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
- [x] 7.3 Migrar QR modal y foto de entrega al componente Modal accesible
  - _Requirements: 11.1_
- [ ]* 7.4 Tests de accesibilidad/comportamiento del Modal (foco inicial, Escape, retorno de foco) y validacion de `QuoteModal`
  - _Requirements: 10.2, 10.4, 11.1_

- [x] 8. Accesibilidad global
- [x] 8.1 Agregar `:focus-visible` consistente en `app/globals.css` para botones/enlaces
  - _Requirements: 11.3_
- [x] 8.2 Auditar y añadir `aria-label` a botones con solo icono/emoji
  - _Requirements: 11.2_
- [x] 8.3 Asegurar indicador de progreso no dependiente solo del color en el stepper del tiquete
  - _Requirements: 11.4_
- [x] 8.4 Revisar contraste de textos secundarios y badges
  - _Requirements: 11.5_

- [x] 9. Onboarding y ayuda contextual
- [x] 9.1 Crear `SetupChecklist` post-registro (logo, pagos, tiquete demo, mensajes, login)
  - _Requirements: 12.2, 12.5_
- [x] 9.2 Crear `FirstRunTasks` (crear tiquete, cambiar estado, enviar WhatsApp/QR) con progreso persistido
  - _Requirements: 12.1, 12.5_
- [x] 9.3 Estados vacios utiles en secciones (pedidos, productos, promociones, caja)
  - _Requirements: 12.3_
- [x] 9.4 Microcopy en campos complejos (saldo, abono, fecha prometida, foto, aprobaciones)
  - _Requirements: 12.4_

- [ ] 10. Refactor mantenible del panel
- [x] 10.1 Definir tipos de dominio (`Order`, `Business`, `BusinessConfig`, `CustomFieldValue`) para superficies tocadas
  - _Requirements: 9.4, 17.1, 17.2, 17.3_
- [~] 10.2 Extraer hooks `usePanelAuth`, `useOrders`, `useBusinessConfig`
  - _Requirements: 9.1, 9.2_
- [x] 10.3 Extraer componentes (helpers, QrModal, DeliveryPhotoModal, DeliveryLinkModal, ScannerModal, CouponPanel, OrdersViews)
  - `page.tsx` reducido de 1681 a ~1026 líneas por extracción incremental
  - _Requirements: 9.1, 9.2_
- [~] 10.4 Aplicar lazy loading a secciones pesadas y dejar `page.tsx` como orquestador
  - _Requirements: 9.3, 9.4_
- [ ]* 10.5 Verificar sin regresiones (`npm run test`, `npm run typecheck`)
  - _Requirements: 9.2, 15.5, 17.2_

- [~] 11. Checkpoint - Correcciones de contrato, cache y refactor del panel
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Rate limiting escalable
- [x] 12.1 Refactor `lib/api/_rate-limiter.ts` con interfaz `RateLimitStore` y `MemoryStore` actual
  - Mantener firma `checkRateLimit(key, limit, windowMs)`
  - _Requirements: 13.4_
- [x] 12.2 Crear migracion `supabase/migrations/*_rate_limits.sql` y `SupabaseStore`
  - _Requirements: 13.1, 13.2, 13.3_
- [ ]* 12.3 Tests de ventana/expiracion para ambos stores
  - _Requirements: 13.5, 15.5_
- [ ]* 12.4 Property test de consistencia del rate limiter
  - **Property 5: Rate limit consistente** — respeta el limite aunque cambien instancias o haya cold starts
  - **Validates: Requirements 13.1, 13.2, 13.3**

- [x] 13. CORS diferenciado y flujo admin
- [x] 13.1 Helper de headers CORS por tipo (public/private) y aplicar a endpoints tocados
  - _Requirements: 14.1, 14.2_
- [x] 13.2 Documentar clasificacion de endpoints publicos/privados
  - _Requirements: 14.3_
- [x] 13.3 Documentar flujo admin activo y verificar `superadmin` en endpoints `admin-*`; deprecar/aislar `admin-login` si no se usa
  - _Requirements: 16.1, 16.2, 16.3_

- [x] 14. Estandarizacion y documentacion de contratos
- [x] 14.1 Documentar convencion de respuesta estandar (`{ success, data, error }` o equivalente)
  - _Requirements: 8.1_
- [x] 14.2 Verificar retrocompatibilidad de endpoints con consumidores y actualizar tests afectados
  - _Requirements: 8.3, 8.4_

- [x] 15. Verificacion final
- [x] 15.1 Ejecutar `npm run test` y asegurar suite completa en verde
  - _Requirements: 15.5_
- [x] 15.2 Ejecutar `npm run typecheck` y resolver errores nuevos
  - _Requirements: 17.2_

- [~] 16. Checkpoint final - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Los sub-tasks marcados con `*` son opcionales (tests unitarios, property tests, integracion) y pueden omitirse para un MVP mas rapido.
- Cada tarea de correccion de contrato debe incluir la actualizacion de sus tests en el mismo cambio.
- Mantener retrocompatibilidad o actualizar consumidores conocidos (buscar usos antes de cambiar formas de respuesta).
- El refactor del panel se hace por extraccion incremental verificando tras cada paso.
- Las property tests validan las Correctness Properties del diseño (Vitest + fast-check).
- Gate de calidad: `npm run test` y `npm run typecheck` deben pasar.

Notas de dependencias:
- Tareas 1–6 son independientes entre si y pueden ejecutarse en paralelo.
- La tarea 7 (Modal accesible) habilita 8 y 9.
- La tarea 6 (cache) precede al refactor del panel (10).
- La tarea 14 depende de que los contratos (1–5) esten definidos.
- La tarea 15 es el gate final (tests + typecheck).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "3.1", "4.1", "5.1", "6.1", "7.1", "10.1", "12.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "3.2", "3.3", "5.2", "5.3", "6.2", "7.2", "7.3", "12.2"] },
    { "id": 2, "tasks": ["1.3", "2.4", "2.5", "3.4", "3.5", "3.6", "4.2", "4.3", "7.4", "8.1", "8.2", "8.3", "8.4", "12.3", "12.4", "13.1", "13.3"] },
    { "id": 3, "tasks": ["9.1", "9.2", "9.3", "9.4", "10.2", "10.3", "13.2", "14.1", "14.2"] },
    { "id": 4, "tasks": ["10.4"] },
    { "id": 5, "tasks": ["10.5", "15.1", "15.2"] }
  ]
}
```
