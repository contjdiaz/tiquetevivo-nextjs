# Implementation Plan: fruver-patty-experience

## Overview

Este plan implementa la experiencia de la vertical fruver para Fruver Patty en cuatro fases incrementales, reutilizando los bloques existentes (endpoints fruver, `create-order`, tiquete `/tiquete`, `qrcode.react`, tema de marca y módulos puros `lib/fruver/*`). Cada tarea construye sobre las anteriores y termina cableada al sistema, sin código huérfano. Las pruebas por propiedades (fast-check) y de ejemplo (Vitest) acompañan a los módulos puros nuevos.

Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.

## Tasks

### Fase 1 — Marca y UX de la página pública

- [x] 1. Aplicar la identidad de marca de Fruver Patty
  - [x] 1.1 Añadir el logo estático y cablearlo al negocio piloto
    - Colocar el logo en `public/icons/fruver-patty.png` (o `.svg`)
    - Verificar/crear migración aditiva idempotente `ADD COLUMN IF NOT EXISTS logo_url TEXT` en `businesses` solo si no existe
    - Actualizar `scripts/seed-fruver-patty.mjs` para asignar `logo_url` del negocio al archivo del logo
    - _Requirements: 1.1, 1.2, 1.5, 8.4_

  - [x] 1.2 Implementar el helper puro de contraste de marca
    - Crear `lib/fruver/brand.ts` con `normalizeHex` y `readableTextColor`
    - Aplicar el color de marca y el color de texto legible en el hero de `QuoteBuilder.tsx`
    - _Requirements: 1.3, 1.4_

  - [ ]* 1.3 Escribir property test de contraste legible
    - **Property 1: Contraste de texto legible sobre el color de marca**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 1.4 Escribir property test de normalización de hex
    - **Property 2: Normalización idempotente de hex**
    - **Validates: Requirements 1.3**

- [x] 2. Mejorar la usabilidad de la página de cotización
  - [x] 2.1 Implementar búsqueda/filtro de productos
    - Extraer `filterProducts` a `lib/fruver/search.ts` (case/acento-insensible) y añadir barra de búsqueda en `QuoteBuilder.tsx`
    - _Requirements: 2.1_

  - [x] 2.2 Añadir estados vacíos, resumen persistente y refinamiento móvil/accesible
    - Estado vacío para catálogo sin productos y para búsqueda sin resultados
    - Resumen persistente (ítems + total) con CTA claro; objetivos táctiles ≥ 40px; foco visible y etiquetas accesibles; mantener el aviso de total estimado
    - Destacar productos de temporada de forma consistente
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 2.3 Escribir property test del filtro de catálogo
    - **Property 3: Filtro de catálogo por nombre**
    - **Validates: Requirements 2.1, 2.5**

### Fase 2 — Página de publicidad

- [x] 3. Crear la página pública de publicidad del negocio
  - [x] 3.1 Extraer AdvertisingSection a un componente compartido
    - Mover `AdvertisingSection` de `QuoteBuilder.tsx` a `app/fruver/[slug]/AdvertisingSection.tsx` y consumirlo desde el catálogo
    - _Requirements: 3.2_

  - [x] 3.2 Implementar el Server Component de publicidad
    - Crear `app/fruver/[slug]/publicidad/page.tsx` que reutiliza el handler `public-catalog`, renderiza hero con logo/nombre/marca, bloques de publicidad, invitación social y CTA hacia `/fruver/[slug]`
    - Añadir `generateMetadata` con título/descripción del negocio
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1_

### Fase 3 — Panel del Dueño (fruver)

- [x] 4. Cablear la sección Fruver en el panel
  - [x] 4.1 Detectar la vertical fruver y montar la pestaña
    - En `app/panel/page.tsx`, detectar vertical fruver desde la config cargada y renderizar condicionalmente una pestaña "Fruver" que monte los componentes de `app/panel/fruver/`
    - _Requirements: 4.1, 5.4, 6.1_

- [x] 5. Implementar la gestión de catálogo en el panel
  - [x] 5.1 Crear CatalogManager
    - Crear `app/panel/fruver/CatalogManager.tsx` con list/create/update/deactivate vía `manage-products`, subida de foto opcional y validación con mensajes de error
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Implementar la gestión de promociones en el panel
  - [x] 6.1 Crear PromotionsManager
    - Crear `app/panel/fruver/PromotionsManager.tsx` con CRUD de banner/combo/código vía `manage-promotions`, validación de ventana y descuento, y desactivación
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Implementar cotizaciones y analítica en el panel
  - [x] 7.1 Crear QuotesPanel
    - Crear `app/panel/fruver/QuotesPanel.tsx` que lista cotizaciones (`quotes-admin` list), permite marcar convertida y muestra el estado
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 7.2 Crear FruverAnalytics
    - Crear `app/panel/fruver/FruverAnalytics.tsx` que muestra métricas vía `fruver-analytics` (semana, conversión, recompra, promedio)
    - _Requirements: 6.3, 6.4_

### Fase 4 — Pedidos y seguimiento a domicilio con QR

- [x] 8. Implementar el puente cotización → pedido
  - [x] 8.1 Implementar helpers puros de conversión
    - Crear `lib/fruver/order-bridge.ts` con `linesToItemsText` y la firma de `convertQuoteToOrder` (idempotencia por `order_id`)
    - _Requirements: 7.1, 7.3_

  - [x] 8.2 Cablear "Convertir en pedido" en QuotesPanel
    - En `QuotesPanel.tsx`, pedir teléfono/dirección si faltan, llamar a `create-order`, luego `quotes-admin` mark-converted con `order_id`; evitar duplicados si ya está convertida
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]* 8.3 Escribir property test de descripción de ítems
    - **Property 4: Descripción de ítems completa y legible**
    - **Validates: Requirements 7.1**

  - [ ]* 8.4 Escribir property test de idempotencia de conversión
    - **Property 5: Idempotencia de la conversión de cotización**
    - **Validates: Requirements 7.3**

  - [ ]* 8.5 Escribir prueba de ejemplo del puente cotización→pedido
    - Verificar payload correcto a `create-order` y `mark-converted` con `order_id` (mocks de red)
    - _Requirements: 7.1, 7.3_

- [x] 9. Habilitar seguimiento a domicilio con QR desde el pedido
  - [x] 9.1 Mostrar QR y enlace de tiquete tras convertir
    - Tras la conversión, mostrar en `QuotesPanel.tsx` el QR (`QRCodeSVG`) y el enlace `/tiquete?number=...&slug=...`; ofrecer generar link de entrega vía `delivery-confirm`
    - _Requirements: 7.2, 7.4, 7.6_

- [x] 10. Checkpoint final — asegurar que pasan las pruebas y verificación
  - Ejecutar `npm run test` y `npm run typecheck`; verificación manual de SSR y accesibilidad básica. Ask the user if questions arise.

## Notes

- Reutilización estricta: no se crean endpoints nuevos; el puente cotización→pedido usa `create-order` + `quotes-admin`.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Las pruebas por propiedades usan `fast-check` (ya instalado), ≥100 iteraciones, una por propiedad, etiquetadas "Feature: fruver-patty-experience, Property {número}".
- La validación WCAG completa requiere pruebas con tecnologías asistivas y revisión experta; aquí se cubren foco, contraste y etiquetas.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.2", "2.3", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["5.1", "6.1", "7.1", "7.2"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["10"] }
  ]
}
```
