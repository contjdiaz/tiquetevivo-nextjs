# TiqueteVivo Fruver: Especificacion de UX/UI e Implementacion

**Estado:** Propuesta lista para planificacion
**Fecha:** Septiembre 2026
**Alcance:** `/fruver/[slug]/inicio`, `/fruver/[slug]`, `/fruver/[slug]/publicidad` y superficies Fruver dentro de `/panel`
**Referencia:** `fruver-patty`

## 1. Resumen

El vertical Fruver cuenta con catalogo, cotizacion, promociones, tiquetes y gestion operativa. La mejora pendiente es principalmente visual y de orientacion: `/inicio` mezcla tres perfiles con accesos de peso similar; el branding dinamico no llega a todos los estados; las rutas publicas repiten shell y la barra fija de cotizacion necesita una estrategia responsive mas robusta.

La iniciativa convierte `/inicio` en un selector de tareas, unifica el sistema de marca entre las rutas Fruver, fortalece el catalogo mobile, mejora accesibilidad y deja componentes reutilizables sin cambiar APIs ni reglas de negocio.

## 2. Objetivos

1. Permitir que un usuario identifique su tarea principal en menos de 10 segundos desde `/inicio`.
2. Diferenciar claramente cliente, operador y domiciliario.
3. Aplicar la marca del negocio de forma consistente en hero, CTA, foco, seleccion, precios y estados.
4. Mantener una experiencia usable en 320, 360, 375, 430, 768 y desktop.
5. Reducir duplicacion visual entre inicio, catalogo, publicidad y panel.
6. Conservar los flujos existentes de catalogo, cotizacion, tiquete, panel y entrega.

## 3. No objetivos

- No cambiar APIs, modelo de datos, permisos ni reglas comerciales.
- No rediseñar el flujo operativo completo de lavanderia.
- No agregar pagos, inventario o autenticacion nuevos.
- No convertir `/inicio` en una landing comercial extensa.
- No eliminar la personalizacion por negocio.

## 4. Usuarios y escenarios

### US-01: Cliente que hace un pedido (P1)

**Dado** que abre `/fruver/[slug]/inicio`, **cuando** selecciona "Ver catalogo y cotizar", **entonces** puede buscar productos, indicar cantidades y ver el total estimado.

### US-02: Operador que administra (P1)

**Dado** que abre el centro de Fruver, **cuando** selecciona "Gestionar mi negocio", **entonces** llega al panel contextualizado con pedidos, catalogo, promociones, cotizaciones y analitica.

### US-03: Cliente que consulta (P1)

**Dado** que tiene un numero de pedido o telefono, **cuando** selecciona "Buscar mi pedido", **entonces** llega directamente a la consulta sin atravesar contenido administrativo.

### US-04: Domiciliario que entrega (P2)

**Dado** que recibe un enlace temporal, **cuando** consulta su acceso, **entonces** entiende que la accion corresponde a entrega y cobro.

### US-05: Cotizacion en mobile (P1)

**Dado** que usa una pantalla de 320 a 430 px, **cuando** cambia cantidades, **entonces** el producto, subtotal, total estimado y CTA no se solapan.

### US-06: Marca personalizada (P1)

**Dado** que el negocio tiene color y logo, **cuando** recorre inicio, catalogo y publicidad, **entonces** reconoce una misma identidad con contraste legible.

## 5. Requisitos funcionales

### Entrada y navegacion

**REQ-001. Selector de tareas.** `/inicio` debe mostrar marca del negocio, contexto breve y la pregunta "Que quieres hacer?" o equivalente.

**REQ-002. CTA principales.** "Gestionar mi negocio" y "Ver catalogo y cotizar" deben tener mayor peso visual que los accesos secundarios.

**REQ-003. Acciones secundarias.** Buscar pedido, tiquete digital, entrega y publicidad deben conservarse como accesos compactos con verbos claros.

**REQ-004. Destinos.** Todos los enlaces deben conservar sus destinos actuales y el `slug` correcto.

**REQ-005. Contenido explicativo.** La explicacion de perfiles no debe bloquear acciones; debe resumirse, colapsarse o quedar despues de los accesos.

### Sistema visual y marca

**REQ-006. Tokens dinamicos.** Las rutas publicas Fruver deben exponer variables comunes para primario, texto sobre primario, superficie suave, borde, foco y estado activo.

**REQ-007. Contraste de marca.** El texto sobre la marca debe usar `readableTextColor` o equivalente y mantener WCAG AA.

**REQ-008. Colores semanticos.** Temporada, advertencia, error y descuento pueden conservar colores propios, pero no deben competir con la identidad primaria.

**REQ-009. Sin verde fijo indebido.** Loading, empty state, precios, tabs, botones y seleccion no deben depender de verde fijo si hay una marca personalizada.

**REQ-010. Iconografia.** Los controles de interfaz deben usar una fuente visual consistente; los emojis quedan para decoracion, producto y temporada.

### Catalogo y cotizacion

**REQ-011. Contrato funcional.** Busqueda, cantidades, subtotales, total estimado, envio y errores deben conservar comportamiento y payload.

**REQ-012. Barra segura.** El resumen fijo debe respetar safe area y no cubrir el ultimo producto, resultado o CTA.

**REQ-013. Layout pequeno.** En 320 a 375 px, resumen y CTA deben pasar a layout vertical cuando no quepan en una fila.

**REQ-014. Producto robusto.** La tarjeta debe soportar nombres largos, precio, unidad, temporada y stepper sin solapamiento.

**REQ-015. Estados claros.** Un producto seleccionado debe comunicarlo por borde, fondo o senal adicional, no solo por color.

### Accesibilidad y arquitectura

**REQ-016. Enlaces externos.** Todo enlace que abre pestana nueva debe comunicarlo visualmente y mediante texto accesible.

**REQ-017. Tabs semanticos.** El panel Fruver debe vincular `tab` y `tabpanel` con `id`, `aria-controls`, `aria-labelledby`, `aria-selected` y foco visible.

**REQ-018. Feedback.** Error, exito, envio y estado vacio deben ser entendibles sin depender solo del color y deben anunciarse cuando sea necesario.

**REQ-019. Shell compartido.** Debe existir un shell reutilizable para header, estados de negocio, variables de tema, contenedor y safe areas.

**REQ-020. Fuente unica de marca.** Inicio, catalogo y publicidad deben compartir normalizacion de marca y tokens.

### Calidad y compatibilidad

**REQ-021. Responsive.** No debe existir overflow horizontal causado por UI en 320, 360, 375, 430, 768, 1024 y 1440 px.

**REQ-022. Carga comprensible.** El usuario debe ver estado de carga o error contextualizado cuando el catalogo tarde o no este disponible.

**REQ-023. Targets tactiles.** Los controles principales deben tener al menos 44 x 44 px, foco visible y nombre accesible.

**REQ-024. No regresion.** Se conservan rutas, APIs, calculo de cotizacion, promociones, validaciones y permisos.

**REQ-025. Evidencia.** Las utilidades de color y layouts criticos deben tener pruebas automatizadas o validacion reproducible documentada.

## 6. Direccion de diseno

### 6.1 `/inicio`

```text
Logo  Nombre del negocio
      Centro de pedidos y entregas

Que quieres hacer?

[Gestionar mi negocio]       [Ver catalogo y cotizar]
 pedidos, catalogo            productos y precios del dia
 promociones y analitica      arma tu pedido

Acciones rapidas
[Buscar mi pedido] [Ver mi tiquete]
[Gestionar entrega] [Publicidad]

Como funciona (colapsable)
```

Desktop usa dos columnas para las acciones principales y una zona compacta para accesos secundarios. Mobile usa una columna y muestra primero "Ver catalogo y cotizar".

### 6.2 Catalogo

Header compacto, promociones agrupadas antes de productos, busqueda persistente, tarjetas con foto/nombre/precio/unidad/stepper, seleccion con borde y fondo de marca, y resumen fijo con contador, total estimado y CTA.

### 6.3 Publicidad

Hero breve con una sola propuesta de valor, CTA hacia catalogo, flujo visual `Catalogo -> Cotizacion -> Pedido -> Tiquete -> Entrega`, ejemplos visuales y menos bloques textuales repetitivos.

### 6.4 Panel Fruver

Conservar tabs actuales, mejorar estado activo, compartir tokens de negocio, completar ARIA y permitir scroll horizontal controlado de tabs en mobile cuando no haya espacio.

### 6.5 Tokens

```css
--fruver-primary
--fruver-on-primary
--fruver-primary-soft
--fruver-primary-border
--fruver-primary-strong
--fruver-surface
--fruver-background
--fruver-focus
```

El color se obtiene con `normalizeHex` y el contraste con `readableTextColor`. Naranja, rojo y violeta quedan reservados para estados semanticos.

### 6.6 Superficies y tipografia

Mantener la tipografia global. Usar titulos de 24 a 32 px, secciones de 16 a 20 px, texto auxiliar de al menos 13 px, espaciado 8/12/16/24/32, `rounded-xl` o `rounded-2xl` y pocas sombras consistentes.

## 7. Arquitectura de componentes

Componentes sugeridos, respetando equivalentes existentes:

- `components/fruver/FruverPageShell.tsx`: canvas, ancho, variables, padding y safe area.
- `components/fruver/FruverBrandHeader.tsx`: logo, nombre, subtitulo y fallback.
- `components/fruver/FruverActionCard.tsx`: CTA principal/secundario con icono.
- `components/fruver/FruverEmptyState.tsx`: negocio no disponible, catalogo vacio y sin resultados.
- `components/fruver/FruverIcon.tsx`: wrapper de iconos Lucide y contenido decorativo.
- Helper compartido para carga publica y normalizacion de negocio.

La informacion privada no debe llegar a rutas publicas. Se mantiene `publicCatalogHandler` como fuente de datos.

## 8. Criterios de aceptacion

### CA-01 Navegacion

- En desktop, las dos acciones principales son visibles sin scroll.
- En 375 px, "Ver catalogo y cotizar" aparece antes de acciones secundarias.
- Cada enlace conserva el destino y el negocio correctos.

### CA-02 Marca

- Colores claros usan texto oscuro cuando maximiza contraste.
- Colores oscuros usan texto claro cuando maximiza contraste.
- Color ausente o invalido usa fallback sin error.
- Hero, CTA, foco, seleccion, precios y estados muestran una identidad coherente.

### CA-03 Responsive

- No hay overflow horizontal en los viewports definidos.
- Nombres largos se envuelven sin tapar controles.
- La barra fija no cubre contenido ni resultados.
- El teclado movil no oculta campos activos ni el CTA relevante.

### CA-04 Accesibilidad

- Todo boton y enlace tiene nombre accesible.
- Enlaces externos anuncian nueva pestana.
- Tabs exponen relaciones semanticas correctas y foco visible.
- Errores y exitos se entienden sin depender del color.

### CA-05 Regresion

- Busqueda, calculo, cantidades, promociones y envio mantienen resultados actuales.
- Catalogo, Promociones, Cotizaciones y Analitica siguen cargando desde el panel.

## 9. Tareas de implementacion

### Fase 1 - Fundacion visual

- [ ] T001 Inventariar colores fijos, tokens y shells repetidos en `app/fruver/[slug]/inicio/page.tsx`, `app/fruver/[slug]/QuoteBuilder.tsx`, `app/fruver/[slug]/AdvertisingSection.tsx` y `app/fruver/[slug]/publicidad/page.tsx`. **REQ-006, REQ-008, REQ-019, REQ-020**
- [ ] T002 Extender `lib/fruver/brand.ts` o crear helper Fruver para variables de marca y agregar pruebas de normalizacion y contraste. **REQ-006, REQ-007, REQ-009, REQ-025**
- [ ] T003 Crear `FruverPageShell`, `FruverBrandHeader` y `FruverEmptyState` en `components/fruver/`. **REQ-019, REQ-020, REQ-022**
- [ ] T004 Crear tokens CSS, focus y safe area en `app/globals.css` con prefijo `fruver`. **REQ-006, REQ-012, REQ-021, REQ-023**
- [ ] T005 Centralizar carga y forma publica del negocio sin cambiar `publicCatalogHandler`. **REQ-020, REQ-024**

### Fase 2 - Centro de tareas `/inicio` (P1)

- [ ] T006 Crear `FruverActionCard` con variantes primaria/secundaria y targets de 48 px. **REQ-002, REQ-003, REQ-010, REQ-023**
- [ ] T007 Redisenar `app/fruver/[slug]/inicio/page.tsx` con hero compacto, pregunta de orientacion y CTAs dominantes. **REQ-001, REQ-002, REQ-005**
- [ ] T008 Mantener y verificar todos los destinos actuales, slug y apertura externa. **REQ-003, REQ-004, REQ-016, REQ-024**
- [ ] T009 Resumir o convertir en disclosure accesible la explicacion de perfiles. **REQ-005, REQ-018**
- [ ] T010 Añadir smoke tests para negocio valido, inexistente, sin logo y color invalido. **REQ-001, REQ-004, REQ-007, REQ-024**

### Fase 3 - Catalogo y cotizacion (P1)

- [ ] T011 Aplicar tokens a `app/fruver/[slug]/QuoteBuilder.tsx` en hero, precios, focus, seleccion, busqueda, CTA y loading. **REQ-006, REQ-009, REQ-015**
- [ ] T012 Ajustar `ProductCard` y `QuantityStepper` para nombres largos y 320 px. **REQ-014, REQ-021, REQ-023**
- [ ] T013 Reestructurar barra fija con safe area, layout vertical y reserva equivalente de espacio. **REQ-012, REQ-013, REQ-021**
- [ ] T014 Mejorar estados vacio, sin resultados, carga y error con `FruverEmptyState`. **REQ-018, REQ-022**
- [ ] T015 Verificar busqueda, calculo, envio y errores sin cambiar contratos. **REQ-011, REQ-024**
- [ ] T016 Crear checklist o pruebas para 320, 360, 375, 768 y desktop. **REQ-021, REQ-025**

### Fase 4 - Publicidad y panel (P2)

- [ ] T017 Aplicar tokens y semantica a `app/fruver/[slug]/AdvertisingSection.tsx`. **REQ-006, REQ-008, REQ-009, REQ-020**
- [ ] T018 Reducir tarjetas repetitivas y mejorar el flujo visual en `app/fruver/[slug]/publicidad/page.tsx` y secciones relacionadas. **REQ-005, REQ-010, REQ-020**
- [ ] T019 Reemplazar iconos funcionales de `app/panel/fruver/FruverPanel.tsx` por Lucide y completar ARIA de tabs. **REQ-010, REQ-017, REQ-023**
- [ ] T020 Revisar tabs en mobile, estado activo y colores fijos del panel. **REQ-009, REQ-017, REQ-021**

### Fase 5 - QA y documentacion

- [ ] T021 Ejecutar pruebas de teclado, foco, contraste y nombres accesibles. **REQ-007, REQ-016, REQ-017, REQ-023**
- [ ] T022 Ejecutar `npm run typecheck`, Vitest relevante y validacion visual en viewports definidos. **REQ-021, REQ-024, REQ-025**
- [ ] T023 Validar fixtures con logo, sin logo, color claro, color oscuro, nombres largos, promociones extensas y catalogo vacio. **REQ-007, REQ-014, REQ-022**
- [ ] T024 Actualizar `docs/analisis_diseño.md`, `docs/analisis_diseño_mobile.md` y `docs/diseño_front.md` para reflejar Next.js/App Router. **REQ-020**
- [ ] T025 Registrar capturas, resultados y defectos residuales en `docs/qa-fruver-ui.md`. **REQ-021, REQ-023, REQ-025**

## 10. Matriz de trazabilidad

| Requisitos | Tareas | Evidencia |
|---|---|---|
| REQ-001 a REQ-005 | T006-T010 | Inicio orientado a tareas y enlaces verificados |
| REQ-006 a REQ-010 | T001-T005, T011, T017-T020 | Tokens, shell, iconos y semantica cromatica |
| REQ-011 a REQ-015 | T011-T016 | Catalogo, barra fija y tarjeta robusta |
| REQ-016 a REQ-018 | T008-T009, T014, T019, T021 | Enlaces, tabs, feedback y accesibilidad |
| REQ-019 a REQ-020 | T003-T005, T017-T018, T024 | Componentes compartidos y documentacion |
| REQ-021 a REQ-025 | T004, T010, T016, T020-T025 | QA responsive, regresion y evidencia |

## 11. Riesgos y decisiones

| Riesgo | Mitigacion |
|---|---|
| Un color claro pierde contraste | Usar `readableTextColor` y validar fixtures claros y oscuros |
| El CTA fijo cubre contenido | Safe area y reserva de espacio con la misma variable |
| Reemplazar emojis elimina personalidad | Conservar emojis en productos, temporada y contenido decorativo |
| Extraer shell cambia rutas estabilizadas | Migracion incremental y pruebas de regresion |
| Documentacion historica contradice Next.js | Actualizarla marcando el estado real y mantener contexto historico |

Decisiones por defecto: se mantienen URLs y endpoints; "Ver catalogo y cotizar" es CTA principal publico; "Gestionar mi negocio" es CTA principal del operador; la primera entrega no requiere migraciones de datos; la iniciativa se limita a UI y presentacion.

## 12. Definition of Done

- Los 25 requisitos tienen tareas y evidencia en la matriz.
- `/inicio` tiene una accion clara para cliente y operador.
- Inicio, catalogo y publicidad comparten shell y tokens.
- No hay overflow horizontal en viewports definidos.
- La barra fija respeta safe areas y no tapa contenido.
- Los controles criticos tienen nombre, foco y target tactil adecuados.
- Typecheck, pruebas relevantes y validacion visual documentada pasan.
- La documentacion describe el estado real de Next.js y Fruver.
