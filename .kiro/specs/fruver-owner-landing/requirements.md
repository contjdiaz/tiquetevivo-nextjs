# Requirements Document

## Introduction

Esta feature amplía la página de publicidad existente del vertical "fruver"
(`/fruver/[slug]/publicidad`) para convertirla en una **landing page detallada
dirigida al dueño del negocio** (Fruver Patty, como cliente de la plataforma).
Hoy la página es una mini-landing de marketing hacia el comprador final; el
objetivo es transformarla en una página que **explique en detalle todas las
funcionalidades de gestión** que ofrece el vertical fruver, manteniendo la
capacidad de compartirse y de dirigir al catálogo para cotizar.

La página sigue siendo un Server Component renderizado en SSR que reutiliza el
handler `public-catalog` para cargar los datos, aplica la marca del negocio con
`lib/fruver/brand.ts` (`normalizeHex`, `readableTextColor`) y reutiliza el
componente compartido `AdvertisingSection`. No se crean endpoints nuevos: la
página solo expone datos públicos ya sanitizados y respeta el aislamiento por
`business_id`. El contenido descriptivo de las funcionalidades de gestión
(catálogo, promociones, cotizaciones, analítica y el puente
cotización → pedido → tiquete con QR) es explicativo y estático, no consulta ni
expone datos operativos privados del panel del dueño.

## Glossary

- **Landing_Dueño**: La página `/fruver/[slug]/publicidad` ampliada, el Server
  Component objeto de esta feature, dirigida al dueño del negocio.
- **Negocio**: El negocio fruver identificado por su `slug` (p. ej. Fruver Patty),
  con datos públicos `name`, `color` y `logo_url`.
- **Catálogo_Handler**: El handler existente `public-catalog`
  (`@/app/api/public-catalog/impl`) que devuelve los datos públicos
  sanitizados del negocio, productos, promociones y bloques de publicidad.
- **Datos_Públicos**: La proyección sanitizada devuelta por el Catálogo_Handler
  (`business`, `products`, `promotions`, `advertising`); nunca incluye campos
  sensibles ni operativos privados.
- **Helper_Marca**: El módulo puro `lib/fruver/brand.ts`, que expone
  `normalizeHex`, `readableTextColor` y `DEFAULT_BRAND_COLOR`.
- **Color_Marca**: El color de marca del Negocio, normalizado con `normalizeHex`
  o `DEFAULT_BRAND_COLOR` cuando no hay color válido.
- **Sección_Publicidad**: El componente compartido `AdvertisingSection`
  (`app/fruver/[slug]/AdvertisingSection.tsx`) que renderiza banners, combos,
  productos de temporada, código de descuento e invitación a redes, ocultando
  los bloques vacíos.
- **Sección_Cómo_Funciona**: Bloque explicativo estático que describe el flujo
  general de uso del vertical para el comprador y el dueño.
- **Sección_Funcionalidades**: Bloque explicativo estático que detalla las
  funcionalidades de gestión del Panel_Dueño y el puente
  cotización → pedido → tiquete.
- **Panel_Dueño**: Conjunto de funcionalidades de gestión del vertical fruver
  (catálogo, promociones, cotizaciones, analítica) descritas en la
  Sección_Funcionalidades.
- **Puente_Cotización_Pedido**: La lógica cotización → pedido → tiquete descrita
  por `lib/fruver/order-bridge.ts`, que genera un pedido con tiquete público, un
  QR de seguimiento y un link de entrega a domicilio.
- **CTA_Cotizar**: Enlace de llamada a la acción que dirige a `/fruver/[slug]`
  para cotizar.
- **Contraste_AA**: El nivel de contraste de texto conforme a WCAG 2.x nivel AA
  garantizado por `readableTextColor`.

## Requirements

### Requirement 1: Carga de datos vía handler existente en SSR

**User Story:** Como dueño del negocio, quiero que la Landing_Dueño cargue mi
información desde el sistema existente, para que refleje mis datos reales sin
crear infraestructura nueva.

#### Acceptance Criteria

1. WHEN se solicita la Landing_Dueño para un `slug`, THE Landing_Dueño SHALL
   obtener los Datos_Públicos invocando el Catálogo_Handler en el servidor.
2. THE Landing_Dueño SHALL renderizarse en modo dinámico del lado del servidor
   (SSR) sin cachear la respuesta del Catálogo_Handler.
3. THE Landing_Dueño SHALL exponer únicamente los Datos_Públicos sanitizados
   devueltos por el Catálogo_Handler, dado que es una página pública sin
   autenticación y no accede a datos privados del dueño.
4. THE Landing_Dueño SHALL usar exclusivamente el `slug` recibido para
   resolver el Negocio, de modo que solo se muestren datos del `business_id`
   correspondiente a ese `slug`.
5. IF el Catálogo_Handler responde con un estado distinto de 200 o un cuerpo no
   interpretable, THEN THE Landing_Dueño SHALL mostrar un estado de
   "Negocio no disponible" con un mensaje explicativo.

### Requirement 2: Aplicación de marca accesible

**User Story:** Como dueño del negocio, quiero que la Landing_Dueño use los
colores y el logo de mi marca, para que la página se sienta propia y legible.

#### Acceptance Criteria

1. THE Landing_Dueño SHALL calcular el Color_Marca aplicando `normalizeHex` al
   color del Negocio y usar `DEFAULT_BRAND_COLOR` cuando el color no sea válido.
2. THE Landing_Dueño SHALL aplicar el Color_Marca a las superficies primarias de
   la página, incluidos el hero y los CTA principales.
3. THE Landing_Dueño SHALL determinar el color de texto sobre el Color_Marca con
   `readableTextColor`, garantizando Contraste_AA.
4. WHERE el Negocio tiene `logo_url`, THE Landing_Dueño SHALL mostrar el logo del
   Negocio en el hero con un texto alternativo igual al nombre del Negocio.
5. IF el Negocio no tiene `logo_url`, THEN THE Landing_Dueño SHALL mostrar un
   marcador visual de respaldo en lugar del logo.
6. WHERE el Negocio tiene `logo_url`, THE Landing_Dueño SHALL intentar mostrar
   el logo indicado por `logo_url` aunque su carga falle, sin sustituirlo por el
   marcador de respaldo.

### Requirement 3: Hero y presentación dirigidos al dueño

**User Story:** Como dueño del negocio, quiero un encabezado que presente mi
negocio y el propósito de la plataforma, para entender de inmediato qué ofrece.

#### Acceptance Criteria

1. THE Landing_Dueño SHALL mostrar en el hero el logo o marcador de respaldo, el
   nombre del Negocio y una presentación breve dirigida al dueño del negocio.
2. THE Landing_Dueño SHALL presentar la plataforma como una herramienta de
   gestión para el dueño del Negocio en la presentación breve.
3. THE Landing_Dueño SHALL mostrar en el hero un CTA_Cotizar visible que dirija a
   `/fruver/[slug]`.

### Requirement 4: Sección "cómo funciona"

**User Story:** Como dueño del negocio, quiero una sección que explique cómo
funciona el vertical de principio a fin, para comprender el recorrido del cliente
y del negocio.

#### Acceptance Criteria

1. THE Landing_Dueño SHALL incluir una Sección_Cómo_Funciona con encabezado
   propio.
2. THE Sección_Cómo_Funciona SHALL describir de forma secuencial los pasos del
   flujo: publicación del catálogo, cotización del comprador, gestión de la
   cotización por el dueño y conversión en pedido con tiquete.
3. THE Sección_Cómo_Funciona SHALL usar exclusivamente contenido explicativo
   estático, sin consultar ni exponer datos operativos privados del Panel_Dueño.

### Requirement 5: Detalle de la página pública de catálogo y cotización

**User Story:** Como dueño del negocio, quiero que la landing explique la página
pública de catálogo y cotización, para saber qué experiencia recibe mi comprador.

#### Acceptance Criteria

1. THE Sección_Funcionalidades SHALL describir la página pública de catálogo y
   cotización con la marca del Negocio, la búsqueda de productos, el total
   estimado, el resumen persistente y los estados vacíos.
2. THE Sección_Funcionalidades SHALL indicar que el total mostrado al comprador
   es un total estimado que el Negocio confirma según disponibilidad y peso real.
3. THE Sección_Funcionalidades SHALL describir que la Landing_Dueño es una página
   de publicidad compartible.

### Requirement 6: Detalle de las funcionalidades de gestión del Panel del Dueño

**User Story:** Como dueño del negocio, quiero conocer en detalle las
funcionalidades de gestión disponibles, para evaluar el valor de la plataforma
para mi negocio.

#### Acceptance Criteria

1. THE Sección_Funcionalidades SHALL describir la gestión de catálogo del
   Panel_Dueño: crear, editar y desactivar productos con foto.
2. THE Sección_Funcionalidades SHALL describir la gestión de promociones del
   Panel_Dueño: banners, combos y códigos con vigencia y porcentaje de descuento.
3. THE Sección_Funcionalidades SHALL describir la gestión de cotizaciones del
   Panel_Dueño: listar cotizaciones, marcarlas como convertidas y convertirlas en
   pedido.
4. THE Sección_Funcionalidades SHALL describir la analítica del Panel_Dueño:
   cotizaciones por semana, porcentaje de conversión, recompra y promedio del
   total estimado.

### Requirement 7: Explicación del puente cotización → pedido → tiquete con QR

**User Story:** Como dueño del negocio, quiero entender cómo una cotización se
convierte en pedido con seguimiento, para confiar en el flujo de entrega.

#### Acceptance Criteria

1. THE Sección_Funcionalidades SHALL describir el Puente_Cotización_Pedido: la
   conversión de una cotización en un pedido con tiquete público.
2. THE Sección_Funcionalidades SHALL explicar que cada pedido generado incluye un
   QR de seguimiento y un link de entrega a domicilio.
3. THE Sección_Funcionalidades SHALL indicar que una cotización produce un único
   pedido, evitando pedidos duplicados por la misma cotización.

### Requirement 8: Reutilización de la sección de publicidad

**User Story:** Como dueño del negocio, quiero que mis promociones y productos de
temporada activos se muestren en la landing, para promover mi oferta vigente.

#### Acceptance Criteria

1. THE Landing_Dueño SHALL renderizar las promociones y bloques de publicidad
   vigentes reutilizando la Sección_Publicidad.
2. WHERE existan bloques de publicidad con contenido, THE Sección_Publicidad
   SHALL mostrar banners, combos, productos de temporada, código de descuento e
   invitación a redes correspondientes.
3. IF no existen bloques de publicidad ni promociones vigentes, THEN THE
   Sección_Publicidad SHALL omitir la sección de publicidad sin mostrar bloques
   vacíos.

### Requirement 9: Invitación a redes y CTAs claros

**User Story:** Como dueño del negocio, quiero que la landing invite a seguir mis
redes y ofrezca acciones claras, para captar y convertir visitantes.

#### Acceptance Criteria

1. WHERE el Negocio tiene una invitación a redes configurada, THE Landing_Dueño
   SHALL mostrar la invitación a redes a través de la Sección_Publicidad.
2. THE Landing_Dueño SHALL incluir un CTA_Cotizar de cierre que dirija a
   `/fruver/[slug]`.
3. WHERE la Landing_Dueño presenta un CTA, THE Landing_Dueño SHALL mostrar ese
   CTA con un texto de acción explícito que describa su destino.

### Requirement 10: Accesibilidad y diseño móvil

**User Story:** Como visitante de la landing, quiero una página accesible y
adaptada a móvil, para usarla cómodamente desde cualquier dispositivo.

#### Acceptance Criteria

1. THE Landing_Dueño SHALL exponer un indicador de foco visible en todos los
   elementos interactivos.
2. THE Landing_Dueño SHALL mantener Contraste_AA entre el texto y su fondo en
   todas las secciones.
3. THE Landing_Dueño SHALL asignar un texto alternativo o etiqueta accesible a
   cada imagen y control interactivo.
4. THE Landing_Dueño SHALL presentar un diseño adaptado a pantallas móviles con
   áreas táctiles de al menos 48 píxeles de alto en los CTA.

### Requirement 11: Metadatos para compartir

**User Story:** Como dueño del negocio, quiero que la landing genere metadatos
para compartir, para que se vea bien al publicarla en redes o mensajería.

#### Acceptance Criteria

1. WHEN se solicitan los metadatos de la Landing_Dueño, THE Landing_Dueño SHALL
   generar título y descripción a partir de los Datos_Públicos del Negocio.
2. WHERE el Negocio tiene `logo_url`, THE Landing_Dueño SHALL incluir el logo del
   Negocio en los metadatos Open Graph.
3. IF los Datos_Públicos del Negocio no están disponibles, THEN THE Landing_Dueño
   SHALL generar título y descripción de respaldo indicando que el Negocio no
   está disponible.
