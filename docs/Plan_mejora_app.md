# Plan de mejora de la app TiqueteVivo

## Resumen ejecutivo

El proyecto esta en una etapa avanzada y tiene bases tecnicas solidas: usa Next.js App Router, Supabase, verticales por negocio, endpoints separados entre `route.ts` e `impl.ts`, sanitizacion de datos publicos y una suite de pruebas amplia. En la revision se ejecuto `npm.cmd test` y el resultado fue positivo: 63 archivos de prueba y 490 tests pasaron.

Los principales riesgos detectados no estan en la ausencia de pruebas unitarias, sino en contratos incompletos entre UI y API, flujos publicos que pueden quedar rotos en produccion, deuda de mantenibilidad en pantallas cliente muy grandes y oportunidades claras de mejora en accesibilidad, onboarding y descubrimiento de funcionalidades.

## 1. Evaluacion de fortalezas y debilidades

### Fortalezas

- Buena separacion entre handlers de Next.js y logica testeable. Por ejemplo, `app/api/create-order/route.ts` delega en `app/api/create-order/impl.ts`, lo que facilita pruebas unitarias y de integracion.
- Seguridad razonable en endpoints publicos. `lib/api/public-ticket-data.ts` centraliza la carga del tiquete publico y elimina campos sensibles como telefono, notas internas, IPs y `customer_id`.
- Autenticacion y permisos por negocio centralizados en `lib/api/_utils.ts`, con roles como `superadmin`, `owner` y `operator`.
- Validadores compartidos en `lib/api/_validators.ts` para telefono, montos, estados, transiciones y campos personalizados.
- Suite de pruebas amplia con Vitest y property-based testing. Hay cobertura sobre OTP, pagos, WhatsApp, promociones, inventario, seguridad, tokens, permisos y persistencia.
- Soporte multi-vertical bien encaminado: existen modulos especificos para fruver y lavanderia, como `lib/fruver/*`, `lib/lavanderia/*`, `app/panel/fruver/*` y `app/panel/lavanderia/*`.
- Tema visual dinamico por negocio mediante variables CSS y `lib/brand-theme.ts`.
- Buen enfoque de MVP operativo: panel, tiquete publico, QR, pagos, WhatsApp, fidelizacion, aprobaciones y recuperacion de pedidos ya existen como flujos funcionales.

### Debilidades

- `app/panel/page.tsx` concentra demasiadas responsabilidades. Mezcla login, carga de configuracion, estado local, cache, formularios, WhatsApp, QR, modales, tabla, kanban, reportes y logica de dominio en un solo archivo de mas de 1.700 lineas. Esto dificulta mantenimiento, performance y pruebas UI.
- Uso extensivo de `any` en entidades centrales como ordenes, negocios, configuracion, promociones y custom fields. Esto reduce la proteccion de TypeScript y hace mas probable que los contratos UI/API se rompan sin ser detectados.
- Dependencia fuerte de `localStorage` para datos de sesion, ordenes y preferencias. Puede generar estados desactualizados o inconsistentes con la nube.
- Rate limiting en memoria en `lib/api/_rate-limiter.ts`. Es aceptable para MVP, pero en entornos serverless o multiples instancias no protege de forma consistente.
- CORS abierto de forma global con `Access-Control-Allow-Origin: *` en utilidades compartidas. Conviene diferenciar endpoints publicos y privados.
- Algunos flujos importantes no parecen cubiertos por tests de integracion, especialmente registro de negocio, retorno de pagos y contratos de respuesta entre frontend y backend.
- La experiencia de onboarding y descubrimiento existe de forma parcial, pero no guia suficientemente al usuario nuevo dentro del panel.

## 2. Recomendaciones de UX/UI

### Navegacion y flujo

- Separar el panel en secciones mas claras: Pedidos, Caja, Clientes, Configuracion, Fruver/Lavanderia y Reportes. Actualmente gran parte vive dentro de `app/panel/page.tsx`, lo que hace que la experiencia crezca en densidad sin una arquitectura visual proporcional.
- Convertir acciones complejas en flujos guiados. Por ejemplo, la generacion de cotizaciones usa `window.prompt`; deberia ser un modal con campos validados, resumen del valor adicional, vista previa del mensaje y confirmacion.
- Mantener la barra inferior movil, pero complementarla con estados activos y labels mas claros para que el usuario sepa donde esta.
- En `/buscar`, reemplazar el texto "Negocio (slug)" por una etiqueta mas comprensible para clientes finales, como "Nombre o enlace del negocio".

### Accesibilidad

- Agregar foco visible global para botones y enlaces. Los inputs tienen `focus:ring`, pero los botones del sistema compartido no garantizan una experiencia consistente con teclado.
- Mejorar modales con `role="dialog"`, `aria-modal="true"`, foco inicial, cierre con Escape y retorno de foco al elemento que abrio el modal.
- Revisar botones que dependen de iconos o emojis para que tengan `aria-label` cuando el texto visible no sea suficiente.
- Revisar contraste de estados secundarios, textos `text-slate-400` y badges sobre fondos claros.
- Evitar que el stepper del tiquete publico dependa solo del color para comunicar progreso.

### Consistencia visual

- Consolidar los patrones de botones, cards, formularios y modales en componentes compartidos. Ya existen `Button`, `Card`, `Field`, `StatusTag`, pero muchas pantallas todavia definen clases manualmente.
- Evitar mezclar `rounded-xl`, `rounded-2xl` y `rounded-3xl` sin criterio claro. El sistema visual seria mas consistente con radios estandarizados.
- Usar iconos de `lucide-react` para acciones de panel en lugar de depender tanto de emojis en botones operativos.

### Velocidad de carga y responsividad

- Dividir `app/panel/page.tsx` en componentes y hooks para permitir lazy loading por seccion.
- Mantener lazy loading en paneles verticales, como ya se hace en fruver/lavanderia.
- Revisar el polling del tiquete publico cada 30 segundos. Funciona para mantener datos frescos, pero deberia espaciarse ante errores repetidos o pestañas en background.
- Limitar respuestas grandes desde API y agregar paginacion real en backend para ordenes.

## 3. Mejoras para exploracion de funcionalidades

### Onboarding

- Agregar un modo primer uso del panel con 3 tareas guiadas:
  1. Crear el primer tiquete.
  2. Cambiar el estado de una orden.
  3. Enviar un enlace por WhatsApp o generar un QR.
- Despues de `/registro`, mostrar un checklist de configuracion inicial:
  - Cargar logo.
  - Configurar metodos de pago.
  - Probar tiquete demo.
  - Revisar mensajes de WhatsApp.
  - Invitar operador o probar login.

### Ayuda contextual

- Convertir la tarjeta "Como funciona" del panel en ayuda contextual segun la vista activa.
- Agregar microcopy dentro de formularios complejos, especialmente en campos como saldo, abono, fecha prometida, foto de entrega y aprobaciones.
- Mostrar estados vacios utiles: cuando no hay pedidos, cuando no hay productos, cuando no hay promociones o cuando aun no se configuro caja.

### Demostraciones interactivas

- Incluir datos demo marcados claramente como demo para negocios nuevos.
- Permitir generar un tiquete de prueba sin enviarlo por WhatsApp.
- Agregar vista previa del mensaje de WhatsApp antes de crear una orden o enviar una cotizacion.
- Mostrar vista previa publica del tiquete durante el registro del negocio.

### Estructura de menus

- Reorganizar el panel lateral con secciones reales:
  - Operacion: Pedidos, Tablero, Escaner.
  - Dinero: Caja, Pagos, Saldos.
  - Clientes: Fidelizacion, Reactivacion.
  - Negocio: Configuracion, Servicios, Mensajes.
  - Vertical: Fruver o Lavanderia segun aplique.

## 4. Posibles bugs y correcciones recomendadas

### Bug 1: contrato roto en registro de negocio

Ubicacion:

- `app/registro/page.tsx`
- `app/api/save-business/route.ts`

Problema:

La UI espera `data.success` al registrar negocio, pero el endpoint devuelve directamente el objeto del negocio. Esto puede provocar que la UI muestre error aunque el negocio se haya guardado correctamente.

Correccion recomendada:

- Opcion A: cambiar el endpoint para devolver `{ success: true, business: data }`.
- Opcion B: cambiar la UI para validar solo `res.ok` y usar el objeto retornado.
- Agregar test de integracion para el flujo completo de registro.

### Bug 2: validacion de slug probablemente falla

Ubicacion:

- `app/registro/page.tsx`
- `app/api/list-businesses/route.ts`

Problema:

La UI llama `/api/list-businesses?q=...` y espera `dataRes.businesses`, pero el endpoint devuelve un array directo. Esto puede lanzar un error al evaluar disponibilidad del slug.

Correccion recomendada:

- Estandarizar la respuesta del endpoint a `{ businesses: [...] }`.
- O adaptar la UI para aceptar tanto array directo como objeto.
- Implementar soporte real para query `q` o crear un endpoint especifico `/api/check-slug`.

### Bug 3: retorno de pagos puede dejar el tiquete sin parametros validos

Ubicacion:

- `app/api/create-payment-intent/route.ts`
- `app/tiquete/TiqueteClient.tsx`

Problema:

El checkout redirige a `/tiquete?order=<id>&payment=complete`, pero el cliente del tiquete solo reconoce `number + slug` o `ticket_token`. El usuario puede volver del pago a una pantalla con error de parametros faltantes.

Correccion recomendada:

- Construir el redirect con `number`, `slug` y/o `ticket_token`.
- Preferible: redirigir a `/tiquete?ticket_token=<token>&payment=complete`.
- Agregar test de integracion para flujo de pago completo.

### Bug 4: `ticket_token` se envia al crear pago pero no se valida

Ubicacion:

- `app/tiquete/TiqueteClient.tsx`
- `app/api/create-payment-intent/route.ts`

Problema:

La UI envia `ticket_token`, pero el endpoint de pago no lo usa para validar acceso a la orden. Si el endpoint queda publico, un usuario podria intentar iniciar pagos de ordenes ajenas conociendo `order_id`.

Correccion recomendada:

- Si la peticion no tiene auth, exigir `ticket_token` y verificar que coincida con la orden.
- Si hay auth, validar permisos del usuario sobre el negocio.
- No devolver datos innecesarios de cliente desde el endpoint.

### Bug 5: cache local desactualizada al cambiar estado

Ubicacion:

- `app/panel/page.tsx`

Problema:

Despues de actualizar una orden, se llama `setOrders`, pero luego se guarda en `localStorage` usando el arreglo viejo de `orders`. Esto puede dejar persistida una version anterior.

Correccion recomendada:

- Calcular `nextOrders` dentro del setter.
- Persistir exactamente `nextOrders`.
- Considerar invalidar cache tras cada mutacion y recargar desde servidor.

### Bug 6: `update-order` acepta `custom_fields` sin revalidacion

Ubicacion:

- `app/api/update-order/impl.ts`

Problema:

Los `custom_fields` se mezclan con los existentes sin pasar por `validateCustomFields`, a diferencia de `create-order`.

Correccion recomendada:

- Validar `custom_fields` contra `businessConfig.custom_fields_config`.
- Rechazar tipos invalidos, campos requeridos vacios y opciones fuera de catalogo.
- Agregar tests de update con custom fields invalidos.

### Bug 7: `list-orders` acepta `limit` sin limite superior

Ubicacion:

- `app/api/list-orders/impl.ts`

Problema:

El endpoint usa directamente `Number(event.queryStringParameters?.limit || 100)`. Un usuario autenticado podria pedir un numero excesivo y afectar rendimiento.

Correccion recomendada:

```ts
const rawLimit = Number(event.queryStringParameters?.limit || 100);
const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 100));
```

### Bug 8: posible duplicacion de numeros de orden

Ubicacion:

- `app/api/create-order/impl.ts`

Problema:

Si no llega `orderNumber`, se usa `String(Date.now()).slice(-6)`. En escenarios de alto trafico o creaciones simultaneas puede haber colisiones.

Correccion recomendada:

- Crear secuencia por negocio.
- Agregar constraint unico `(business_id, order_number)`.
- Implementar retry cuando haya conflicto.

### Bug 9: flujo admin duplicado o ambiguo

Ubicacion:

- `app/api/admin-login/impl.ts`
- `app/admin/page.tsx`
- `lib/api/_admin-auth.ts`

Problema:

Existe un endpoint legacy `admin-login`, pero la UI de admin usa `/api/auth-login`. Puede ser intencional por compatibilidad, pero hoy queda ambiguo.

Correccion recomendada:

- Documentar claramente el flujo activo.
- Eliminar o aislar el endpoint legacy si ya no se usa.
- Asegurar que todos los endpoints admin validen `superadmin` como ya hace `validateAdminToken`.

### Bug 10: rate limiting en memoria no escala

Ubicacion:

- `lib/api/_rate-limiter.ts`

Problema:

El rate limiter se reinicia en cold starts y no comparte estado entre instancias. En produccion serverless, la proteccion puede ser inconsistente.

Correccion recomendada:

- Migrar a Redis, Upstash, Supabase table con TTL, o proveedor de edge rate limiting.
- Mantener tests actuales y agregar pruebas de ventana/expiracion contra el adaptador nuevo.

## 5. Plan de accion priorizado

### Prioridad alta

1. Corregir contratos de registro entre `/registro`, `/api/list-businesses` y `/api/save-business`.
2. Corregir flujo de retorno de pagos y validar `ticket_token` en `/api/create-payment-intent`.
3. Validar `custom_fields` en `update-order`.
4. Limitar `limit` en `list-orders`.
5. Agregar tests de integracion para registro, pagos y tiquete publico.

### Prioridad media

1. Refactorizar `app/panel/page.tsx` en componentes y hooks:
   - `usePanelAuth`
   - `useOrders`
   - `useBusinessConfig`
   - `OrderFormDrawer`
   - `QrModal`
   - `DeliveryPhotoModal`
   - `OrdersSection`
   - `PanelSidebar`
2. Reemplazar `window.prompt` por modales controlados.
3. Mejorar accesibilidad de modales, botones y navegacion por teclado.
4. Crear onboarding inicial y checklist de configuracion.
5. Estandarizar respuestas API con formato `{ success, data, error }` o una convencion equivalente.

### Prioridad baja

1. Migrar rate limiting a almacenamiento compartido.
2. Revisar CORS por tipo de endpoint.
3. Reducir uso de `any` con tipos de dominio.
4. Mejorar estados vacios, ayudas contextuales y previews.
5. Documentar decisiones de arquitectura y contratos publicos.

## 6. Verificacion realizada

- `npm.cmd test`: exitoso.
- Resultado: 63 archivos de prueba pasaron, 490 tests pasaron.
- `npm run typecheck`: no ejecutado por bloqueo de PowerShell con `npm.ps1` y limitaciones del entorno.

## 7. Criterios de exito

- Registro de negocio funciona de punta a punta sin errores falsos.
- Un pago iniciado desde tiquete publico vuelve a una URL valida y actualizable.
- Ningun endpoint publico permite operar sobre una orden sin token o permisos adecuados.
- El panel queda dividido en unidades mantenibles y testeables.
- Los modales son navegables por teclado y tienen roles ARIA correctos.
- Usuarios nuevos pueden descubrir las funciones principales sin capacitacion externa.
- La suite de tests incluye flujos integrados de registro, pago, busqueda, tiquete publico y actualizacion de estado.
