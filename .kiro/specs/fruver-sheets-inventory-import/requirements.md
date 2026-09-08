# Requirements Document

## Introduction

Esta funcionalidad permite al dueño de un negocio de la vertical "fruver" importar manualmente su inventario de productos desde una hoja de cálculo de Google Sheets que ha sido publicada como CSV mediante una URL pública (Archivo > Compartir > Publicar en la web > CSV). La importación no requiere credenciales ni la API de Google.

La importación se activa mediante un botón en el panel del dueño, junto al gestor de catálogo existente (`CatalogManager`). Al importar, la hoja se trata como la fuente de verdad: se crean los productos nuevos, se actualizan los existentes (coincidencia por nombre normalizado o por columna id/sku opcional) y los productos del catálogo que no aparecen en la hoja se desactivan (`active = false`), nunca se eliminan, de modo que la operación es reversible.

La funcionalidad reutiliza el modelo de datos existente (tabla `products`, tipo `Product`, unidades `kg`/`libra`/`unidad`, `day_price >= 0`), respeta el aislamiento por `business_id` y requiere el permiso `manage_business`. Al finalizar, el dueño recibe un resumen con el número de productos creados, actualizados, desactivados y las filas rechazadas con su motivo.

Esta es una importación manual bajo demanda; la sincronización automática periódica queda explícitamente fuera de alcance (posible fase futura).

## Glossary

- **Importador_Inventario**: El componente del sistema (lógica de servidor) que descarga, parsea, valida y aplica los cambios del CSV al catálogo de productos de un negocio.
- **Panel_Fruver**: La interfaz del dueño en el panel de la vertical fruver donde reside `CatalogManager` y el botón de importación.
- **URL_CSV_Publicada**: La URL pública de Google Sheets publicada en formato CSV que el dueño proporciona como origen de los datos.
- **Producto**: Un artículo del catálogo almacenado en la tabla `products`, modelado por el tipo `Product` (campos: `id`, `business_id`, `name`, `unit`, `day_price`, `photo_url`, `is_seasonal`, `active`).
- **Fila_CSV**: Una línea de datos del CSV (excluyendo la fila de encabezado) que representa un producto candidato.
- **Fila_Invalida**: Una `Fila_CSV` que no cumple las reglas de validación (nombre vacío, unidad no permitida, precio negativo o no numérico).
- **Clave_Coincidencia**: El criterio usado para emparejar una `Fila_CSV` con un `Producto` existente: el valor de la columna `sku`/`id` cuando está presente, o el nombre normalizado en caso contrario.
- **Nombre_Normalizado**: El nombre de un producto transformado a una forma canónica insensible a mayúsculas/minúsculas y a acentos, con espacios iniciales/finales recortados, usado para la coincidencia.
- **Resumen_Importacion**: El informe devuelto al dueño con los conteos de productos creados, actualizados y desactivados, y la lista de filas rechazadas con su motivo.
- **Unidad_Venta**: La unidad de venta de un producto; debe ser exactamente una de `kg`, `libra` o `unidad` (constante `SALE_UNITS`).
- **Hosts_Permitidos**: El conjunto de hosts autorizados para la `URL_CSV_Publicada` (dominios de Google Sheets / Google Docs) usado para prevenir ataques SSRF.
- **Permiso_Gestion**: El permiso `manage_business` requerido para operar sobre el catálogo de un negocio.

## Requirements

### Requirement 1: Iniciar la importación desde el panel

**User Story:** Como dueño del negocio, quiero pulsar un botón en el panel fruver para importar mi inventario desde una hoja de Google Sheets publicada como CSV, para actualizar mi catálogo sin capturar cada producto manualmente.

#### Acceptance Criteria

1. THE Panel_Fruver SHALL mostrar un control de importación de inventario junto al gestor de catálogo.
2. WHEN el dueño proporciona una URL_CSV_Publicada y activa el control de importación, THE Importador_Inventario SHALL iniciar el proceso de importación para el `business_id` del dueño.
3. WHILE una importación está en curso, THE Panel_Fruver SHALL indicar el estado de progreso al dueño.
4. WHILE ninguna importación está en curso, THE Panel_Fruver SHALL ocultar el indicador de progreso de importación.
5. IF el dueño activa el control de importación sin proporcionar una URL_CSV_Publicada, THEN THE Importador_Inventario SHALL rechazar la solicitud con un mensaje que indique que la URL es obligatoria.

### Requirement 2: Autorización y aislamiento por negocio

**User Story:** Como dueño del negocio, quiero que solo yo (o usuarios autorizados de mi negocio) puedan importar inventario a mi catálogo, para proteger mis datos de otros negocios.

#### Acceptance Criteria

1. WHEN se recibe una solicitud de importación, THE Importador_Inventario SHALL requerir el permiso Permiso_Gestion para el `business_id` indicado antes de procesar la solicitud.
2. IF la solicitud de importación carece de autorización válida para el `business_id` indicado, THEN THE Importador_Inventario SHALL rechazar la solicitud con un error de autorización y SHALL dejar el catálogo sin cambios.
3. THE Importador_Inventario SHALL leer y escribir Productos únicamente dentro del `business_id` autenticado en la solicitud.

### Requirement 3: Validación de la URL de origen (prevención SSRF)

**User Story:** Como responsable de la plataforma, quiero que la URL de origen se restrinja a hosts de Google Sheets permitidos, para evitar que el servidor realice solicitudes a destinos internos o arbitrarios (SSRF).

#### Acceptance Criteria

1. WHEN se recibe una URL_CSV_Publicada, THE Importador_Inventario SHALL aceptar la URL solo si usa el esquema `https` y su host pertenece a los Hosts_Permitidos.
2. IF la URL_CSV_Publicada usa un esquema distinto de `https`, THEN THE Importador_Inventario SHALL rechazar la solicitud con un mensaje que indique que el esquema no es permitido.
3. IF el host de la URL_CSV_Publicada no pertenece a los Hosts_Permitidos, THEN THE Importador_Inventario SHALL rechazar la solicitud con un mensaje que identifique el host como no permitido.
4. IF la URL_CSV_Publicada incumple más de una regla de validación de URL, THEN THE Importador_Inventario SHALL informar al dueño de todos los motivos de rechazo detectados.

### Requirement 4: Descarga del CSV y manejo de errores de red

**User Story:** Como dueño del negocio, quiero recibir un mensaje claro cuando la hoja no se pueda descargar, para saber que debo revisar la publicación o la conexión sin que mi catálogo se dañe.

#### Acceptance Criteria

1. WHEN la URL_CSV_Publicada es válida, THE Importador_Inventario SHALL descargar el contenido del CSV desde esa URL.
2. IF la descarga del CSV falla por un error de red o una respuesta con estado de error, THEN THE Importador_Inventario SHALL abortar la importación, dejar el catálogo sin cambios e informar al dueño con un mensaje descriptivo del fallo de descarga.
3. IF el tamaño del contenido descargado excede el límite máximo configurado de la hoja, THEN THE Importador_Inventario SHALL abortar la importación, dejar el catálogo sin cambios e informar al dueño que la hoja excede el tamaño permitido.
4. IF la descarga no finaliza dentro del tiempo de espera configurado, THEN THE Importador_Inventario SHALL abortar la importación, dejar el catálogo sin cambios e informar al dueño de que la descarga expiró.

### Requirement 5: Parseo del CSV y columnas esperadas

**User Story:** Como dueño del negocio, quiero que la hoja se interprete con columnas conocidas, para que los datos de cada producto se lean correctamente.

#### Acceptance Criteria

1. THE Importador_Inventario SHALL interpretar la primera fila del CSV como encabezado de columnas.
2. THE Importador_Inventario SHALL requerir la presencia de las columnas `nombre`, `unidad` y `precio` como columnas obligatorias.
3. THE Importador_Inventario SHALL reconocer las columnas `foto_url`, `temporada`, `activo` y `sku` como columnas opcionales.
4. IF el CSV no contiene alguna de las columnas obligatorias, THEN THE Importador_Inventario SHALL abortar la importación, dejar el catálogo sin cambios e informar al dueño de cuáles columnas obligatorias faltan.
5. IF el contenido descargado no puede parsearse como CSV, THEN THE Importador_Inventario SHALL abortar la importación, dejar el catálogo sin cambios e informar al dueño de que el CSV está mal formado.
6. WHILE las columnas obligatorias están presentes, THE Importador_Inventario SHALL continuar la importación aunque existan Filas_Invalidas u otros errores a nivel de fila.

### Requirement 6: Validación por fila

**User Story:** Como dueño del negocio, quiero que las filas con datos incorrectos se rechacen individualmente con un motivo claro, para corregirlas sin perder la importación de las filas válidas.

#### Acceptance Criteria

1. WHEN una Fila_CSV tiene el campo `nombre` vacío o solo con espacios, THE Importador_Inventario SHALL marcar la fila como Fila_Invalida con el número de fila y el motivo "nombre vacío".
2. WHEN el campo `unidad` de una Fila_CSV no es una Unidad_Venta permitida, THE Importador_Inventario SHALL marcar la fila como Fila_Invalida con el número de fila y el motivo de unidad no permitida.
3. WHEN el campo `precio` de una Fila_CSV no es un número o es negativo, THE Importador_Inventario SHALL marcar la fila como Fila_Invalida con el número de fila y el motivo de precio inválido.
4. THE Importador_Inventario SHALL aplicar las reglas de validación de nombre, unidad y precio a cada Fila_CSV de la hoja.
5. THE Importador_Inventario SHALL continuar procesando las Filas_CSV restantes después de encontrar una Fila_Invalida.
6. THE Importador_Inventario SHALL excluir toda Fila_Invalida de las operaciones de creación y actualización de Productos.

### Requirement 7: Coincidencia de productos (match)

**User Story:** Como dueño del negocio, quiero que los productos de la hoja se asocien con los productos existentes de mi catálogo, para que se actualicen en lugar de duplicarse.

#### Acceptance Criteria

1. WHERE una Fila_CSV incluye un valor no vacío en la columna `sku`, THE Importador_Inventario SHALL usar ese valor como Clave_Coincidencia frente al identificador correspondiente de los Productos existentes.
2. WHERE una Fila_CSV no incluye un valor de `sku`, THE Importador_Inventario SHALL usar el Nombre_Normalizado como Clave_Coincidencia frente al Nombre_Normalizado de los Productos existentes.
3. THE Importador_Inventario SHALL calcular el Nombre_Normalizado de forma insensible a mayúsculas/minúsculas y a acentos, recortando los espacios iniciales y finales.
4. IF dos o más Filas_CSV válidas comparten la misma Clave_Coincidencia dentro de la misma importación, THEN THE Importador_Inventario SHALL marcar esas filas como Fila_Invalida con el número de fila y el motivo de clave duplicada.

### Requirement 8: Aplicación de cambios (crear, actualizar, desactivar)

**User Story:** Como dueño del negocio, quiero que la hoja sea la fuente de verdad al importar, para que mi catálogo refleje exactamente los productos vigentes de la hoja.

#### Acceptance Criteria

1. WHEN una Fila_CSV válida no coincide con ningún Producto existente, THE Importador_Inventario SHALL crear un Producto nuevo con los valores de la fila y con `active = true`.
2. WHEN una Fila_CSV válida coincide con un Producto existente, THE Importador_Inventario SHALL actualizar ese Producto con los valores de la fila.
3. WHEN un Producto existente activo no coincide con ninguna Fila_CSV válida, THE Importador_Inventario SHALL establecer `active = false` en ese Producto.
4. THE Importador_Inventario SHALL preservar todos los Productos existentes que no aparecen en la hoja, cambiando únicamente su campo `active` sin eliminarlos.
5. WHERE una Fila_CSV incluye la columna opcional `activo`, THE Importador_Inventario SHALL aplicar el valor booleano de esa columna al campo `active` del Producto creado o actualizado.
6. WHERE una Fila_CSV incluye la columna opcional `temporada`, THE Importador_Inventario SHALL aplicar el valor booleano de esa columna al campo `is_seasonal` del Producto creado o actualizado.
7. WHERE una Fila_CSV incluye la columna opcional `foto_url` con un valor no vacío, THE Importador_Inventario SHALL aplicar ese valor al campo `photo_url` del Producto creado o actualizado.

### Requirement 9: Resumen del resultado

**User Story:** Como dueño del negocio, quiero un resumen del resultado de la importación, para saber qué cambió y qué filas debo corregir.

#### Acceptance Criteria

1. WHEN una importación finaliza, THE Importador_Inventario SHALL devolver un Resumen_Importacion con el número de Productos creados, actualizados y desactivados.
2. WHEN una importación finaliza, THE Importador_Inventario SHALL incluir en el Resumen_Importacion la lista de Filas_Invalidas, cada una con su número de fila y su motivo de rechazo.
3. WHEN una importación finaliza correctamente, THE Panel_Fruver SHALL mostrar al dueño una confirmación de éxito junto con el Resumen_Importacion.
4. IF la presentación del Resumen_Importacion en el Panel_Fruver falla, THEN THE Importador_Inventario SHALL mantener la importación como exitosa y sus cambios aplicados en el catálogo.

### Requirement 10: Seguridad e idempotencia de la operación

**User Story:** Como dueño del negocio, quiero que la importación sea segura y repetible, para que reimportar la misma hoja no cambie el estado del catálogo ni lo dañe ante fallos.

#### Acceptance Criteria

1. IF la importación falla durante la aplicación de cambios, THEN THE Importador_Inventario SHALL dejar el catálogo en un estado consistente e informar al dueño del fallo.
2. WHEN la misma hoja sin cambios se importa una segunda vez consecutiva, THE Importador_Inventario SHALL producir un catálogo con el mismo conjunto de Productos y los mismos valores de campos que tras la primera importación (idempotencia).
3. WHEN la misma hoja sin cambios se importa una segunda vez consecutiva, THE Resumen_Importacion SHALL indicar cero Productos creados y cero Productos desactivados.
