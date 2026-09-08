# Requirements Document

## Introduction

Este documento define los requisitos para **fruver-catalog-quoting**, una nueva vertical de negocio ("fruver": tienda de frutas y verduras) dentro de la plataforma multi-vertical TiqueteVivo (Next.js App Router + Supabase). El negocio piloto es **Fruver Patty**.

La propuesta convierte cada tiquete digital en un canal de publicidad continua y habilita una herramienta de cotización de mercado y pedidos recurrentes. La funcionalidad se apoya en los bloques ya existentes de la plataforma y NO los reinventa:

- **Verticales** definidas por `lib/api/_vertical-config.ts` (defaults de servicios, flujo de estados, campos personalizados y plantillas de WhatsApp). Se agrega la vertical "fruver".
- **Clientes** de `lib/api/_customers.ts` (únicos por `business_id + phone`). La lista de compra frecuente se asocia a un cliente.
- **Tiquete público** servido y sanitizado en `lib/api/public-ticket-data.ts` y renderizado por el Server Component `/tiquete`. La publicidad/anuncios respetan la misma sanitización de datos públicos.
- **WhatsApp y motor de plantillas** ya existentes (`lib/api/_whatsapp.ts`, `lib/api/_template-engine.ts`). Las cotizaciones se envían por WhatsApp usando este mecanismo, incluyendo enlace de respaldo (`buildFallbackLink`).
- **Configuración de negocio** que ya soporta `payment_config`, `loyalty_config`, `status_flow_config`, `custom_fields_config`. Se agregan una nueva configuración de catálogo de productos y una de promociones.
- **Rate limiting** para endpoints públicos (`lib/api/_rate-limiter.ts`), aplicado a los nuevos endpoints públicos de catálogo y cotización.
- **Migraciones** de Supabase aditivas e idempotentes para las nuevas tablas.

El objetivo del piloto es validar métricas de conversión (cotizaciones enviadas, cotizaciones convertidas en compra, recompra con lista guardada, aumento del valor promedio de carrito con promociones visibles y reducción de llamadas por precios/disponibilidad).

## Glossary

- **Plataforma**: la aplicación multi-vertical TiqueteVivo (Next.js + Supabase).
- **Negocio**: entidad `businesses` que representa una tienda concreta (ej. Fruver Patty), identificada por `business_id` y `slug`.
- **Vertical_Fruver**: la vertical "fruver" registrada en la tabla `verticals`, con sus defaults de configuración.
- **Producto**: artículo del catálogo del Negocio (fruta o verdura) con nombre, unidad de venta, precio del día, estado y datos opcionales.
- **Unidad_Venta**: unidad de medida en que se vende un Producto; valores permitidos: `kg`, `libra`, `unidad`.
- **Catalogo**: conjunto de Productos activos de un Negocio con sus precios vigentes.
- **Gestor_Catalogo**: componente del servidor responsable de las operaciones CRUD sobre Productos.
- **Promocion**: mensaje o beneficio promocional configurado por el Dueño (banner, combo o código de descuento) con una ventana de validez.
- **Gestor_Promociones**: componente del servidor responsable de las operaciones CRUD sobre Promociones.
- **Combo**: Promoción que agrupa varios Productos con un descuento asociado.
- **Codigo_Descuento**: código de texto que otorga un descuento en la próxima compra, mostrado en el tiquete.
- **Tiquete_Publico**: recibo digital sanitizado accesible por QR mediante `slug + número`, renderizado por el Server Component `/tiquete`.
- **Renderizador_Publicidad**: componente que compone los bloques de publicidad (Promociones, novedades, combos, invitación social, Codigo_Descuento) sobre el Tiquete_Publico respetando la sanitización pública.
- **Pagina_Cotizacion**: página pública accesible por QR donde el Cliente arma su mercado y ve un total estimado.
- **Cotizacion**: registro persistido con los Productos y cantidades seleccionados por un Cliente y su total estimado en un momento dado.
- **Gestor_Cotizaciones**: componente del servidor responsable de crear, persistir y consultar Cotizaciones.
- **Cliente**: entidad `customers` única por `business_id + phone`.
- **Lista_Frecuente**: conjunto guardado de Productos y cantidades asociado a un Cliente, reutilizable para repetir pedidos.
- **Total_Estimado**: suma calculada de (precio del día × cantidad) de los Productos seleccionados en una Cotizacion; es una estimación, no un cobro.
- **Dueño**: usuario operador autenticado que administra un Negocio desde el panel.
- **Limitador_Tasa**: el mecanismo de rate limiting (`checkRateLimit`) aplicado a endpoints públicos.
- **Datos_Publicos_Seguros**: los campos permitidos para exposición pública tras aplicar la lista blanca de sanitización de `public-ticket-data.ts`.
- **Analitica_Piloto**: conjunto de métricas agregadas por Negocio para validar el piloto.

## Requirements

### Requirement 1: Registro de la vertical fruver

**User Story:** Como administrador de la plataforma, quiero registrar la vertical "fruver" con sus defaults, para que un Negocio de frutas y verduras pueda configurarse reutilizando el modelo multi-vertical existente.

#### Acceptance Criteria

1. THE Plataforma SHALL registrar la Vertical_Fruver en la tabla `verticals` con `slug` igual a "fruver", nombre visible y emoji definidos.
2. WHEN un Negocio se asocia a la Vertical_Fruver, THE Plataforma SHALL aplicar los defaults de la vertical (`services_default`, `status_flow_default`, `custom_fields_default`, `whatsapp_templates_default`) siguiendo el mismo mecanismo de `applyVerticalDefaults`.
3. THE Vertical_Fruver SHALL incluir plantillas de WhatsApp por defecto para el evento de envío de Cotizacion.
4. WHERE un Negocio pertenece a la Vertical_Fruver, THE Plataforma SHALL habilitar la configuración de Catalogo y la configuración de Promociones para ese Negocio.

### Requirement 2: Gestión del catálogo de productos (CRUD)

**User Story:** Como Dueño de Fruver Patty, quiero registrar y mantener mis productos con su precio del día, para que los clientes vean un catálogo actualizado.

#### Acceptance Criteria

1. WHEN el Dueño autenticado crea un Producto con nombre, Unidad_Venta y precio del día, THE Gestor_Catalogo SHALL persistir el Producto asociado al `business_id` del Negocio y marcarlo como activo por defecto.
2. THE Gestor_Catalogo SHALL aceptar como Unidad_Venta únicamente los valores `kg`, `libra` o `unidad`.
3. IF el Dueño intenta crear o actualizar un Producto con una Unidad_Venta distinta de `kg`, `libra` o `unidad`, THEN THE Gestor_Catalogo SHALL rechazar la operación y devolver un mensaje de error descriptivo.
4. IF el Dueño intenta crear o actualizar un Producto con precio del día menor que cero o no numérico, THEN THE Gestor_Catalogo SHALL rechazar la operación y devolver un mensaje de error descriptivo.
5. WHEN el Dueño autenticado actualiza el nombre, precio del día, Unidad_Venta, foto o indicador de temporada de un Producto existente, THE Gestor_Catalogo SHALL guardar los cambios y registrar la fecha de actualización.
6. WHERE el Dueño adjunta una foto opcional al Producto, THE Gestor_Catalogo SHALL almacenar la referencia de la foto reutilizando el mecanismo de almacenamiento de fotos existente.
7. WHEN el Dueño marca un Producto como inactivo, THE Gestor_Catalogo SHALL conservar el Producto pero excluirlo del Catalogo mostrado en la Pagina_Cotizacion.
8. WHERE el Dueño marca un Producto con el indicador de temporada, THE Gestor_Catalogo SHALL registrar dicho indicador para que el Producto pueda destacarse como novedad/temporada.
9. WHEN el Dueño autenticado solicita la lista de Productos de su Negocio, THE Gestor_Catalogo SHALL devolver únicamente los Productos cuyo `business_id` coincide con el Negocio del Dueño.

### Requirement 3: Gestión de promociones

**User Story:** Como Dueño de Fruver Patty, quiero configurar promociones, combos y un código de descuento, para que cada tiquete impulse la próxima compra.

#### Acceptance Criteria

1. WHEN el Dueño autenticado crea una Promocion de tipo banner/mensaje con un texto y una ventana de validez (fecha de inicio y fecha de fin), THE Gestor_Promociones SHALL persistirla asociada al `business_id` del Negocio.
2. WHEN el Dueño autenticado crea un Combo con un conjunto de Productos y un porcentaje de descuento, THE Gestor_Promociones SHALL persistir el Combo con su descuento y ventana de validez.
3. WHEN el Dueño autenticado configura un Codigo_Descuento con un porcentaje y una ventana de validez, THE Gestor_Promociones SHALL persistir el Codigo_Descuento asociado al Negocio.
4. IF el Dueño configura una Promocion cuya fecha de fin es anterior a la fecha de inicio, THEN THE Gestor_Promociones SHALL rechazar la operación y devolver un mensaje de error descriptivo.
5. IF el Dueño configura un Combo o Codigo_Descuento con un porcentaje de descuento fuera del rango 0 a 100, THEN THE Gestor_Promociones SHALL rechazar la operación y devolver un mensaje de error descriptivo.
6. WHEN el Dueño autenticado desactiva una Promocion, THE Gestor_Promociones SHALL marcarla como inactiva y excluirla del Renderizador_Publicidad.
7. THE Gestor_Promociones SHALL devolver como Promociones vigentes únicamente aquellas activas cuya fecha actual esté dentro de la ventana de validez.

### Requirement 4: Publicidad integrada en el tiquete público

**User Story:** Como Cliente de Fruver Patty, quiero ver promociones, novedades y un código de descuento en mi tiquete, para enterarme de las ofertas sin depender de redes sociales.

#### Acceptance Criteria

1. WHEN el Tiquete_Publico de un Negocio de la Vertical_Fruver es solicitado, THE Renderizador_Publicidad SHALL incluir las Promociones vigentes de ese Negocio junto al detalle de la compra.
2. WHERE existen Productos marcados con indicador de temporada, THE Renderizador_Publicidad SHALL mostrar una sección de novedades/productos de temporada en el Tiquete_Publico.
3. WHERE existen Combos vigentes, THE Renderizador_Publicidad SHALL mostrar los Combos sugeridos con su descuento en el Tiquete_Publico.
4. WHERE el Negocio tiene configurada una invitación a redes sociales o a un canal de difusión de WhatsApp, THE Renderizador_Publicidad SHALL mostrar dicha invitación en el Tiquete_Publico.
5. WHERE existe un Codigo_Descuento vigente, THE Renderizador_Publicidad SHALL mostrar el Codigo_Descuento con su texto de próxima compra en el Tiquete_Publico.
6. THE Renderizador_Publicidad SHALL componer todos los bloques de publicidad usando únicamente Datos_Publicos_Seguros, sin exponer campos sensibles definidos en la lista de sanitización de `public-ticket-data.ts`.
7. IF un Negocio no tiene Promociones ni Combos ni Codigo_Descuento vigentes, THEN THE Renderizador_Publicidad SHALL renderizar el Tiquete_Publico con el detalle de la compra sin bloques de publicidad vacíos.

### Requirement 5: Página pública de catálogo y cotización

**User Story:** Como Cliente de Fruver Patty, quiero escanear el QR y armar mi mercado con precios de hoy, para conocer el total estimado antes de ir a la tienda o pedir domicilio.

#### Acceptance Criteria

1. WHEN un Cliente accede a la Pagina_Cotizacion mediante el QR del Negocio (por `slug`), THE Plataforma SHALL mostrar el Catalogo con los Productos activos y sus precios del día vigentes.
2. WHEN el Cliente selecciona un Producto e indica una cantidad, THE Pagina_Cotizacion SHALL agregar el Producto con su cantidad a la selección actual.
3. WHILE el Cliente modifica la selección de Productos o cantidades, THE Pagina_Cotizacion SHALL recalcular y mostrar el Total_Estimado como la suma de (precio del día × cantidad) de los Productos seleccionados.
4. IF el Cliente ingresa una cantidad menor o igual que cero o no numérica para un Producto, THEN THE Pagina_Cotizacion SHALL rechazar esa cantidad y solicitar una cantidad válida.
5. THE Pagina_Cotizacion SHALL indicar explícitamente que el Total_Estimado es una estimación sujeta a confirmación de disponibilidad y precio final por parte del Negocio.
6. WHEN el Cliente accede a la Pagina_Cotizacion, THE Plataforma SHALL exponer únicamente Datos_Publicos_Seguros del Negocio y de los Productos, sin campos sensibles.

### Requirement 6: Envío de la cotización por WhatsApp

**User Story:** Como Cliente de Fruver Patty, quiero enviar mi cotización por WhatsApp al fruver, para confirmar disponibilidad y precio final.

#### Acceptance Criteria

1. WHEN el Cliente confirma el envío de su selección desde la Pagina_Cotizacion, THE Gestor_Cotizaciones SHALL persistir la Cotizacion con los Productos, cantidades y Total_Estimado asociados al `business_id`.
2. WHEN una Cotizacion es persistida, THE Plataforma SHALL enviarla al WhatsApp del Negocio reutilizando el módulo de WhatsApp y el motor de plantillas existentes.
3. IF el envío por la API de WhatsApp no está disponible o falla, THEN THE Plataforma SHALL entregar un enlace de respaldo de WhatsApp (`buildFallbackLink`) con el contenido de la Cotizacion.
4. THE mensaje de WhatsApp de la Cotizacion SHALL incluir el listado de Productos con cantidades y el Total_Estimado en formato legible.
5. IF el Cliente proporciona su teléfono al enviar la Cotizacion, THEN THE Plataforma SHALL asociar la Cotizacion al Cliente correspondiente (único por `business_id + phone`) reutilizando `upsertCustomer` sin incrementar el contador de pedidos.

### Requirement 7: Persistencia de cotizaciones y seguimiento de conversión

**User Story:** Como Dueño de Fruver Patty, quiero registrar el estado de cada cotización, para saber cuántas se convierten en compras reales.

#### Acceptance Criteria

1. WHEN una Cotizacion es creada, THE Gestor_Cotizaciones SHALL registrarla con un estado inicial de "enviada" y su fecha de creación.
2. WHEN el Dueño autenticado marca una Cotizacion como convertida en compra, THE Gestor_Cotizaciones SHALL actualizar el estado a "convertida" y registrar la fecha de conversión.
3. WHERE una Cotizacion convertida se vincula a un pedido, THE Gestor_Cotizaciones SHALL almacenar la referencia al pedido asociado.
4. WHEN el Dueño autenticado consulta las Cotizaciones de su Negocio, THE Gestor_Cotizaciones SHALL devolver únicamente las Cotizaciones cuyo `business_id` coincide con el Negocio del Dueño.
5. THE Gestor_Cotizaciones SHALL conservar el histórico de Cotizaciones sin eliminarlas al cambiar de estado.

### Requirement 8: Listas de compra frecuente

**User Story:** Como Cliente de Fruver Patty, quiero guardar mi lista de mercado, para repetir el pedido en un clic la próxima vez.

#### Acceptance Criteria

1. WHEN el Cliente identificado por teléfono guarda su selección como Lista_Frecuente, THE Plataforma SHALL persistir la Lista_Frecuente con sus Productos y cantidades asociada al Cliente y al `business_id`.
2. WHEN el Cliente identificado por teléfono solicita cargar su Lista_Frecuente, THE Plataforma SHALL restaurar en la Pagina_Cotizacion los Productos y cantidades guardados.
3. WHILE se carga una Lista_Frecuente, THE Plataforma SHALL recalcular el Total_Estimado usando los precios del día vigentes en el momento de la carga.
4. IF un Producto guardado en la Lista_Frecuente está inactivo o ya no existe, THEN THE Plataforma SHALL omitir ese Producto de la selección restaurada e informar al Cliente cuáles Productos no están disponibles.
5. WHEN el Cliente repite un pedido desde una Lista_Frecuente cargada, THE Plataforma SHALL permitir enviar la Cotizacion resultante por WhatsApp con el mismo flujo del Requisito 6.
6. THE Plataforma SHALL asociar cada Lista_Frecuente a un único Cliente por `business_id + phone`.

### Requirement 9: Analítica del piloto

**User Story:** Como Dueño de Fruver Patty, quiero ver las métricas del piloto, para validar si la herramienta genera resultados.

#### Acceptance Criteria

1. WHEN el Dueño autenticado consulta la Analitica_Piloto para un rango de fechas, THE Plataforma SHALL devolver el número de Cotizaciones enviadas por semana en ese rango, filtrado por su `business_id`.
2. WHEN el Dueño autenticado consulta la Analitica_Piloto, THE Plataforma SHALL calcular el porcentaje de Cotizaciones convertidas como (Cotizaciones convertidas ÷ Cotizaciones enviadas) × 100 en el rango consultado.
3. WHEN el Dueño autenticado consulta la Analitica_Piloto, THE Plataforma SHALL devolver el número de Clientes que repitieron compra usando una Lista_Frecuente en el rango consultado.
4. WHEN el Dueño autenticado consulta la Analitica_Piloto, THE Plataforma SHALL devolver el Total_Estimado promedio de las Cotizaciones enviadas en el rango consultado.
5. IF no existen Cotizaciones enviadas en el rango consultado, THEN THE Plataforma SHALL devolver un porcentaje de conversión igual a 0 sin producir un error de división.
6. THE Plataforma SHALL calcular todas las métricas de la Analitica_Piloto de forma aislada por `business_id`.

### Requirement 10: Seguridad de endpoints públicos (no funcional)

**User Story:** Como responsable de la plataforma, quiero que los endpoints públicos de catálogo y cotización estén sanitizados y limitados, para evitar fuga de datos y abuso.

#### Acceptance Criteria

1. WHEN se recibe una solicitud a un endpoint público de Catalogo o de Cotizacion, THE Limitador_Tasa SHALL aplicar el control de tasa por IP y endpoint mediante `checkRateLimit`.
2. IF una IP supera el límite de solicitudes configurado en la ventana de tiempo, THEN THE Plataforma SHALL rechazar la solicitud con un código de error y un valor de reintento (`retryAfter`).
3. THE endpoints públicos de Catalogo y de Cotizacion SHALL exponer únicamente Datos_Publicos_Seguros, aplicando la misma lista blanca de sanitización que `public-ticket-data.ts`.
4. WHEN un endpoint público recibe parámetros de entrada del Cliente, THE Plataforma SHALL validar dichos parámetros antes de consultar la base de datos.

### Requirement 11: Rendimiento de la página de catálogo (no funcional)

**User Story:** Como Cliente de Fruver Patty, quiero que el catálogo cargue rápido, para armar mi mercado sin demoras.

#### Acceptance Criteria

1. WHEN un Cliente solicita la Pagina_Cotizacion de un Negocio con hasta 200 Productos activos, THE Plataforma SHALL responder con el Catalogo en 2 segundos o menos bajo condiciones normales de red.
2. WHILE el Cliente modifica cantidades en la Pagina_Cotizacion, THE Pagina_Cotizacion SHALL actualizar el Total_Estimado en el cliente sin realizar una nueva consulta al servidor por cada cambio.
3. THE consulta del Catalogo SHALL recuperar únicamente los Productos activos del Negocio para evitar transferir datos innecesarios.

### Requirement 12: Aislamiento multi-tenant (no funcional)

**User Story:** Como responsable de la plataforma, quiero que los datos de cada negocio estén aislados, para garantizar la privacidad entre tenants.

#### Acceptance Criteria

1. THE Gestor_Catalogo, THE Gestor_Promociones y THE Gestor_Cotizaciones SHALL filtrar todas las lecturas y escrituras por el `business_id` correspondiente.
2. IF una solicitud intenta acceder a Productos, Promociones, Cotizaciones o Listas_Frecuentes de un `business_id` distinto al del contexto autenticado o del `slug` público solicitado, THEN THE Plataforma SHALL negar el acceso a esos datos.
3. THE nuevas tablas de Supabase SHALL crearse mediante migraciones aditivas e idempotentes que incluyan la columna `business_id` para el aislamiento por tenant.
4. WHERE se aplican políticas de acceso a nivel de fila, THE Plataforma SHALL restringir el acceso a los datos según el `business_id`.

