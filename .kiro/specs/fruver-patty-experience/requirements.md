# Requirements Document

## Introduction

Esta spec cubre la **experiencia de producto** de la vertical fruver para el negocio piloto **Fruver Patty**, construyendo sobre la lógica ya implementada en la spec `fruver-catalog-quoting` (catálogo, cotización, promociones, analítica). El objetivo es hacer la página pública más intuitiva y amigable, aplicar la identidad de marca de Fruver Patty (logo y paleta verde-lima/naranja), añadir una pequeña página de publicidad, dotar al Dueño de un panel para gestionar su vertical, y cerrar el ciclo conectando la cotización con un pedido real con tiquete y QR de seguimiento a domicilio.

El trabajo se organiza en cuatro fases incrementales:

- **Fase 1 — Marca y UX** de la página pública `/fruver/[slug]`.
- **Fase 2 — Página de publicidad** pública del negocio.
- **Fase 3 — Panel del Dueño** para catálogo, promociones, cotizaciones y analítica.
- **Fase 4 — Pedidos y seguimiento a domicilio con QR**, conectando la cotización con `create-order` y el tiquete existente.

### Alcance y no-alcance

- **En alcance:** UI/UX, marca, página de publicidad, vistas de panel para fruver, y el puente cotización → pedido → tiquete/QR de seguimiento.
- **Fuera de alcance:** cambios al modelo de datos ya definido en `fruver-catalog-quoting` salvo columnas aditivas estrictamente necesarias; pasarela de pagos nueva; rediseño de otras verticales.

### Principio rector

Reutilizar los bloques existentes de la plataforma (endpoints, `create-order`, tiquete público `/tiquete`, `qrcode.react`, tema de marca `lib/brand-theme.ts`, sanitización de `lib/fruver/*`) en lugar de reinventarlos.

## Glossary

- **Vertical fruver:** tipo de negocio de frutas y verduras dentro de la plataforma multi-vertical.
- **Fruver Patty:** negocio piloto (slug `fruver-patty`).
- **Cotización (Quote):** selección de productos con cantidades y Total_Estimado que el Cliente envía; puede convertirse en pedido.
- **Total_Estimado:** suma de `day_price × qty` de las líneas seleccionadas; lo confirma el negocio.
- **Pedido (Order):** registro transaccional con `ticket_token` que habilita el tiquete público y su QR.
- **Tiquete:** vista pública `/tiquete` de seguimiento del pedido, accesible por QR/enlace.
- **Renderizador_Publicidad:** composición de bloques (`buildAdvertisingBlocks`) de promociones, temporada, combos, invitación social y código de descuento.
- **Dueño:** operador autenticado con permiso `manage_business`.

## Requirements

### Requisito 1 — Identidad de marca de Fruver Patty

**Historia de usuario:** Como Dueño de Fruver Patty, quiero que mi página pública muestre mi logo y mis colores de marca, para que los clientes reconozcan mi negocio y confíen en él.

#### Criterios de aceptación

1. CUANDO un Cliente abre `/fruver/fruver-patty` ENTONCES el sistema DEBERÁ mostrar el logo de Fruver Patty en el encabezado.
2. CUANDO existe un `logo_url` para el negocio ENTONCES el sistema DEBERÁ renderizar esa imagen; SI no existe ENTONCES DEBERÁ mostrar un marcador de posición neutral sin romper el diseño.
3. CUANDO se renderiza la página ENTONCES el sistema DEBERÁ aplicar el color de marca del negocio (`business.color`) a los elementos primarios (encabezado, botón de acción, acentos) con contraste de texto accesible.
4. CUANDO el color de marca produce bajo contraste con texto blanco ENTONCES el sistema DEBERÁ ajustar el color del texto para mantener legibilidad (AA).
5. El logo DEBERÁ estar disponible como archivo estático servible por la app y referenciado de forma estable.

### Requisito 2 — Página pública intuitiva y amigable

**Historia de usuario:** Como Cliente, quiero armar mi pedido de forma sencilla y clara, para cotizar rápido sin confundirme.

#### Criterios de aceptación

1. CUANDO el catálogo tiene productos ENTONCES el sistema DEBERÁ permitir buscar/filtrar productos por nombre en tiempo real en el cliente.
2. CUANDO hay productos marcados de temporada ENTONCES el sistema DEBERÁ destacarlos visualmente de forma consistente.
3. CUANDO el Cliente ajusta cantidades ENTONCES el sistema DEBERÁ mostrar el subtotal por producto y el Total_Estimado recalculado localmente sin recargar la página.
4. CUANDO el Cliente selecciona al menos un producto ENTONCES el sistema DEBERÁ mostrar de forma persistente un resumen (cantidad de ítems y total) y un llamado a la acción claro para enviar.
5. CUANDO el catálogo está vacío o no hay resultados de búsqueda ENTONCES el sistema DEBERÁ mostrar un estado vacío explicativo, no una pantalla en blanco.
6. CUANDO la página se ve en un dispositivo móvil ENTONCES el sistema DEBERÁ mantener objetivos táctiles cómodos (≥ 40px) y el resumen/acción accesible sin obstruir el contenido.
7. CUANDO un elemento interactivo recibe foco de teclado ENTONCES el sistema DEBERÁ mostrar un indicador de foco visible y etiquetas accesibles.
8. El sistema DEBERÁ mostrar el aviso explícito de que el total es estimado y lo confirma el negocio.

### Requisito 3 — Página de publicidad del negocio

**Historia de usuario:** Como Dueño, quiero una página de publicidad sencilla, para promocionar mi negocio, promociones y redes con un enlace que pueda compartir.

#### Criterios de aceptación

1. CUANDO un visitante abre la ruta pública de publicidad del negocio ENTONCES el sistema DEBERÁ mostrar el logo, nombre y una presentación breve del negocio.
2. CUANDO existen promociones vigentes, productos de temporada o combos vigentes ENTONCES el sistema DEBERÁ mostrarlos usando la composición de publicidad existente (`buildAdvertisingBlocks`), sin renderizar bloques vacíos.
3. CUANDO existe invitación a redes en la configuración del negocio ENTONCES el sistema DEBERÁ mostrar el enlace/llamado correspondiente.
4. CUANDO el visitante desea cotizar ENTONCES el sistema DEBERÁ ofrecer un llamado a la acción hacia la página de catálogo `/fruver/[slug]`.
5. La página de publicidad DEBERÁ usar únicamente datos públicos sanitizados y respetar el aislamiento por negocio.
6. La página de publicidad DEBERÁ ser apta para compartir (metadatos básicos de título/descripción).

### Requisito 4 — Panel del Dueño: catálogo de productos

**Historia de usuario:** Como Dueño, quiero gestionar mis productos y sus precios del día desde el panel, para mantener el catálogo actualizado.

#### Criterios de aceptación

1. CUANDO el Dueño autenticado abre la sección de catálogo ENTONCES el sistema DEBERÁ listar sus productos (activos e inactivos) filtrados por su `business_id`.
2. CUANDO el Dueño crea un producto con nombre, unidad válida (`kg`/`libra`/`unidad`) y precio ≥ 0 ENTONCES el sistema DEBERÁ persistirlo mediante `manage-products` con `active = true`.
3. CUANDO el Dueño edita un producto ENTONCES el sistema DEBERÁ guardar los cambios y actualizar `updated_at`.
4. CUANDO el Dueño desactiva un producto ENTONCES el sistema DEBERÁ marcarlo `active = false` conservando el registro y excluyéndolo del catálogo público.
5. CUANDO el Dueño adjunta una foto de producto ENTONCES el sistema DEBERÁ subirla con el flujo de fotos existente y asociarla al producto.
6. CUANDO una entrada es inválida ENTONCES el sistema DEBERÁ mostrar un mensaje de error descriptivo y no persistir.
7. El acceso a estas operaciones DEBERÁ requerir el permiso `manage_business`.

### Requisito 5 — Panel del Dueño: promociones

**Historia de usuario:** Como Dueño, quiero crear y administrar banners, combos y códigos de descuento con su ventana de vigencia, para publicitar ofertas.

#### Criterios de aceptación

1. CUANDO el Dueño crea un banner/combo/código con `starts_at` y `ends_at` tales que `ends_at >= starts_at` ENTONCES el sistema DEBERÁ persistirlo mediante `manage-promotions`.
2. CUANDO el descuento de un combo/código está fuera de `[0,100]` o la ventana es inválida ENTONCES el sistema DEBERÁ rechazarlo con un mensaje descriptivo.
3. CUANDO el Dueño desactiva una promoción ENTONCES el sistema DEBERÁ excluirla del renderizador de publicidad.
4. CUANDO el Dueño lista promociones ENTONCES el sistema DEBERÁ mostrar su estado y vigencia, filtradas por su `business_id`.
5. El acceso a estas operaciones DEBERÁ requerir el permiso `manage_business`.

### Requisito 6 — Panel del Dueño: cotizaciones y analítica

**Historia de usuario:** Como Dueño, quiero ver las cotizaciones recibidas y las métricas del piloto, para dar seguimiento y decidir.

#### Criterios de aceptación

1. CUANDO el Dueño abre la sección de cotizaciones ENTONCES el sistema DEBERÁ listar las cotizaciones de su negocio (más recientes primero) usando `quotes-admin`.
2. CUANDO el Dueño marca una cotización como convertida ENTONCES el sistema DEBERÁ actualizar su estado a `convertida` y registrar `converted_at`, conservando líneas y total, sin eliminar el registro.
3. CUANDO el Dueño abre la analítica ENTONCES el sistema DEBERÁ mostrar cotizaciones por semana, porcentaje de conversión (0 si no hay enviadas), recompras con lista frecuente y Total_Estimado promedio, todo por su `business_id`.
4. El acceso a estas operaciones DEBERÁ requerir permiso de operador (`manage_business`/`read` según el endpoint).

### Requisito 7 — Puente cotización → pedido con tiquete y QR

**Historia de usuario:** Como Dueño, quiero convertir una cotización en un pedido con tiquete digital y QR, para gestionar el domicilio y que el cliente siga su estado.

#### Criterios de aceptación

1. CUANDO el Dueño convierte una cotización en pedido ENTONCES el sistema DEBERÁ crear un pedido mediante `create-order` a partir de las líneas de la cotización (descripción legible de ítems y total estimado).
2. CUANDO el pedido se crea ENTONCES el sistema DEBERÁ generar el `ticket_token` y el pedido DEBERÁ ser consultable en el tiquete público `/tiquete`.
3. CUANDO se crea el pedido desde una cotización ENTONCES el sistema DEBERÁ enlazar `order_id` en la cotización y marcarla `convertida` (Requisito 6.2), sin duplicar pedidos si ya estaba convertida.
4. CUANDO el Dueño gestiona la entrega ENTONCES el sistema DEBERÁ permitir generar el enlace/QR de seguimiento y de confirmación de entrega reutilizando el flujo de tiquete/entrega existente.
5. CUANDO el pedido carece de teléfono del cliente ENTONCES el sistema DEBERÁ solicitarlo antes de crear el pedido, pues es obligatorio para el tiquete/WhatsApp.
6. El pedido y su tiquete DEBERÁN respetar el aislamiento por `business_id`.

### Requisito 8 — No funcionales transversales

#### Criterios de aceptación

1. Las páginas públicas nuevas DEBERÁN exponer únicamente datos sanitizados (whitelist) sin filtrar campos internos ni de otro negocio.
2. Los endpoints públicos consumidos DEBERÁN mantener el rate limiting existente.
3. La página pública de catálogo DEBERÁ renderizar el estado inicial mediante SSR con tiempo objetivo ≤ 2 s en condiciones normales.
4. Cualquier migración adicional DEBERÁ ser aditiva e idempotente y conservar RLS por `business_id`.
5. Las vistas del panel DEBERÁN degradar con mensajes claros ante errores de red o autorización, sin romper la interfaz.
