# Implementation Plan: fruver-owner-landing

## Overview

Amplía la página existente `app/fruver/[slug]/publicidad/page.tsx` para
convertirla en una landing detallada dirigida al dueño del negocio. El trabajo
es de **reutilización primero**: se conserva el Server Component SSR dinámico y
la carga vía `Catálogo_Handler` (`@/app/api/public-catalog/impl`), se reutilizan
los helpers puros de `lib/fruver/brand.ts` y el componente compartido
`AdvertisingSection`, y se añaden dos secciones explicativas estáticas nuevas
(`Sección_Cómo_Funciona` y `Sección_Funcionalidades`).

El diseño **no define Correctness Properties aplicables** (Property 1 declara que
no aplica PBT). Por tanto las tareas de prueba usan pruebas de ejemplo/unitarias,
snapshot, accesibilidad (axe) e integración con el handler real, todas marcadas
como opcionales (`*`). Los tests de render/snapshot/axe se ejecutan en entorno
`jsdom`; hoy `vitest.config.ts` usa entorno `node`, por lo que se añade
configuración de entorno por archivo o docblock según convenga.

## Tasks

- [x] 1. Preparar contenido estático y utilidades de presentación de la landing
  - [x] 1.1 Definir el contenido estático de las secciones explicativas
    - En `app/fruver/[slug]/publicidad/page.tsx` (o un módulo colocalizado
      `content.ts` en la misma carpeta) definir las constantes de presentación
      `PasoComoFunciona[]` y `TarjetaFuncionalidad[]` con los textos exactos:
      pasos de flujo (publicación del catálogo → cotización del comprador →
      gestión de la cotización → pedido con tiquete) y tarjetas de
      funcionalidades (página pública de catálogo, gestión de catálogo,
      promociones, cotizaciones, analítica, puente cotización→pedido→tiquete)
    - Incluir en los textos las afirmaciones clave: total **estimado** confirmado
      según disponibilidad y peso real; landing **compartible**; cada pedido con
      **QR de seguimiento** y **link de entrega a domicilio**; **un único pedido
      por cotización**
    - Tipar las constantes con las interfaces `PasoComoFunciona` y
      `TarjetaFuncionalidad`; contenido 100% estático, sin fetch ni datos privados
    - _Requirements: 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_

- [x] 2. Extender la carga de datos y los metadatos dirigidos al dueño
  - [x] 2.1 Verificar y ajustar `loadCatalog` para aislamiento por slug y estado de error
    - Confirmar que `loadCatalog(slug)` invoca el `Catálogo_Handler` en servidor
      pasando únicamente el `slug` recibido y devuelve `CatalogData | null`
    - Mantener `export const dynamic = "force-dynamic"` (SSR sin caché)
    - Asegurar que devuelve `null` cuando `statusCode !== 200` o el cuerpo no es
      interpretable (JSON inválido capturado)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Actualizar `generateMetadata` con enfoque dirigido al dueño
    - Derivar título y descripción de los `Datos_Públicos` con textos que
      posicionen la plataforma como herramienta de gestión del dueño
    - Incluir el logo en `openGraph.images` cuando exista `logo_url`
    - Producir metadatos de respaldo ("Negocio no disponible") cuando no hay datos
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 2.3 Escribir pruebas de ejemplo para carga de datos y metadatos
    - Mockear el `Catálogo_Handler`: 200 → `CatalogData`; ≠200 y JSON inválido → `null`
    - Verificar que `loadCatalog` llama al handler con el `slug` recibido (aislamiento)
    - Verificar título/descripción derivados del negocio y logo en Open Graph;
      y metadatos de respaldo sin datos
    - _Requirements: 1.1, 1.4, 1.5, 11.1, 11.2, 11.3_

- [x] 3. Extender el Hero dirigido al dueño con marca accesible
  - [x] 3.1 Reescribir el pitch y CTA del hero
    - Calcular `brandColor = normalizeHex(business.color) ?? DEFAULT_BRAND_COLOR`
      y `brandTextColor = readableTextColor(brandColor)`; aplicarlos al fondo y
      texto del hero
    - Sustituir el pitch al comprador por una presentación breve dirigida al
      dueño que posicione la plataforma como herramienta de gestión
    - Mantener el manejo de logo: `<img>` con `alt` = nombre del negocio cuando
      hay `logo_url` (sin degradar a fallback ante fallo de carga); marcador de
      respaldo cuando no hay `logo_url`
    - Mantener el `CTA_Cotizar` del hero hacia `/fruver/[slug]` con texto de
      acción explícito y altura táctil ≥ 48 px
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 9.3, 10.4_

  - [ ]* 3.2 Escribir pruebas de ejemplo para marca y hero
    - Color válido → color normalizado; color inválido/ausente → `DEFAULT_BRAND_COLOR`;
      texto vía `readableTextColor`
    - Con `logo_url` → `<img alt={name}>`; sin `logo_url` → marcador de respaldo
    - Hero contiene pitch dirigido al dueño y `CTA_Cotizar` hacia `/fruver/[slug]`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 4. Implementar la Sección_Cómo_Funciona (estática)
  - [x] 4.1 Crear el subcomponente presentacional `ComoFuncionaSection`
    - Añadir un subcomponente presentacional (sin estado de cliente) en la ruta
      que renderice un encabezado propio y los cuatro pasos secuenciales a partir
      de las constantes definidas en 1.1
    - Componerlo en el `main` de la página después del hero
    - Cumplir accesibilidad transversal (foco visible, contraste AA, etiquetas)
    - _Requirements: 4.1, 4.2, 4.3, 10.1, 10.2, 10.3_

  - [ ]* 4.2 Escribir pruebas de ejemplo para Sección_Cómo_Funciona
    - Verificar encabezado propio y presencia de los cuatro pasos en orden
    - Verificar que no realiza fetch ni expone datos privados (solo texto estático)
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Implementar la Sección_Funcionalidades (estática)
  - [x] 5.1 Crear el subcomponente presentacional `FuncionalidadesSection`
    - Renderizar encabezado propio y los subbloques a partir de las constantes de
      1.1: página pública de catálogo y cotización (con total estimado y landing
      compartible), gestión de catálogo, promociones, cotizaciones, analítica y
      puente cotización→pedido→tiquete (con QR + link de entrega y único pedido
      por cotización)
    - Componerlo en el `main` después de la Sección_Cómo_Funciona; contenido
      puramente textual, sin invocar `order-bridge.ts` ni consultar pedidos
    - Cumplir accesibilidad transversal (foco visible, contraste AA, etiquetas)
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 10.1, 10.2, 10.3_

  - [ ]* 5.2 Escribir pruebas de ejemplo para Sección_Funcionalidades
    - Verificar presencia de los subbloques y las afirmaciones clave: total
      estimado confirmado por el negocio, landing compartible, QR + link de
      entrega, único pedido por cotización
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_

- [x] 6. Integrar la sección de publicidad y el CTA de cierre
  - [x] 6.1 Componer `AdvertisingSection` y el CTA de cierre en la página
    - Reutilizar `AdvertisingSection` con `advertising` y `promotions` (oculta
      bloques vacíos y muestra invitación a redes cuando existe)
    - Mantener el CTA de cierre hacia `/fruver/[slug]` con texto de acción
      explícito y altura táctil ≥ 48 px, aplicando `brandColor`/`brandTextColor`
    - Ordenar el `main`: Hero → Cómo_Funciona → Funcionalidades → Advertising →
      CTA de cierre
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.4_

  - [ ]* 6.2 Escribir pruebas de ejemplo para publicidad y CTAs de cierre
    - Con bloques → se renderiza la sección de publicidad; sin bloques ni
      promociones → se omite sin bloques vacíos
    - Existen `CTA_Cotizar` en hero y cierre, ambos hacia `/fruver/[slug]` con
      texto explícito
    - _Requirements: 8.1, 8.3, 9.1, 9.2, 9.3_

- [x] 7. Checkpoint - Verificar composición y pruebas de ejemplo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Pruebas de snapshot y accesibilidad de la landing
  - [ ]* 8.1 Escribir pruebas de snapshot del render
    - Snapshot con negocio con marca y bloques de publicidad
    - Snapshot del estado "Negocio no disponible"
    - Snapshot de la landing sin promociones (sección de publicidad omitida)
    - _Requirements: 1.5, 8.3_

  - [ ]* 8.2 Escribir pruebas de accesibilidad (axe)
    - Auditoría automática axe sobre el render (contraste, etiquetas, roles)
    - Verificar estilos de foco visibles en elementos interactivos y altura
      mínima de 48 px en los CTA
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 9. Prueba de integración con el handler real
  - [ ]* 9.1 Escribir prueba de integración de `loadCatalog` contra el Catálogo_Handler real
    - 1–2 ejemplos que ejerciten `loadCatalog` contra el handler real y confirmen
      el contrato (`business`, `products`, `promotions`, `advertising`) y que solo
      se expone la proyección sanitizada
    - _Requirements: 1.1, 1.3_

- [x] 10. Checkpoint final - Verificar toda la suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.
- Esta feature **no aplica PBT** (design Property 1); se usan pruebas de ejemplo, snapshot, accesibilidad e integración.
- Cada tarea referencia cláusulas de requisitos específicas para trazabilidad.
- Los tests de render/snapshot/axe requieren entorno `jsdom`; el `vitest.config.ts` actual usa `node`, así que configura el entorno por archivo (docblock `// @vitest-environment jsdom`) al escribir esos tests.
- La lógica pura reutilizada (`brand.ts`, `order-bridge.ts`) ya está cubierta en sus specs de origen y no se duplica aquí.
- Se conserva la ruta y firma actuales de `page.tsx`, `loadCatalog` y `generateMetadata` (reutilización primero).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "8.1", "8.2", "9.1"] }
  ]
}
```
