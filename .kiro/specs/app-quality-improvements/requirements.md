# Requirements Document

Mejoras de calidad de la app TiqueteVivo.

## Introduction

Este spec traduce el `docs/Plan_mejora_app.md` en un conjunto de requisitos verificables para elevar la calidad de TiqueteVivo (Next.js App Router + Supabase). El foco esta en corregir contratos rotos entre UI y API, asegurar flujos publicos (registro, pago, tiquete), reducir deuda de mantenibilidad en el panel, y mejorar accesibilidad y onboarding.

Los bugs fueron validados contra el codigo actual:
- `app/api/save-business/route.ts` devuelve el objeto del negocio directamente (sin `success`), pero `app/registro/page.tsx` valida `data.success`.
- `app/api/list-businesses/route.ts` devuelve un array plano, pero `app/registro/page.tsx` lee `dataRes.businesses` y no aplica el filtro `q`.
- `app/api/create-payment-intent/route.ts` redirige a `/tiquete?order=<id>&payment=complete`, pero `TiqueteClient.tsx` solo reconoce `number+slug` o `ticket_token`.
- `TiqueteClient.tsx` envia `ticket_token` a create-payment-intent, pero el endpoint no lo valida.
- `app/api/update-order/impl.ts` mezcla `custom_fields` sin revalidar contra `custom_fields_config`.
- `app/api/list-orders/impl.ts` usa `Number(...limit || 100)` sin cota superior.
- `lib/api/_rate-limiter.ts` mantiene estado en memoria (no escala en serverless).

## Glossary

- **Contrato de API**: forma esperada de request/response acordada entre frontend y backend.
- **Tiquete publico**: vista `/tiquete` accesible por cliente final sin login, via `number+slug` o `ticket_token`.
- **Vertical**: tipo de negocio (lavanderia, fruver) con configuracion y plantillas propias.
- **Custom fields**: campos personalizados por negocio definidos en `custom_fields_config`.

---

## Requirements

### Requirement 1: Contrato de registro de negocio

**User Story:** Como dueño de un negocio nuevo, quiero completar el registro y llegar al panel sin ver errores falsos, para confiar en la plataforma desde el primer uso.

#### Acceptance Criteria

1. WHEN el frontend llama `POST /api/save-business` con datos validos THEN el endpoint SHALL responder `200` con un cuerpo que incluya `success: true` y el objeto del negocio (por ejemplo `{ success: true, business: {...} }`).
2. WHEN `save-business` falla por validacion THEN el endpoint SHALL responder con `4xx` e incluir `success: false` y un `message` legible.
3. WHEN el registro es exitoso THEN `app/registro/page.tsx` SHALL navegar a `/panel?slug=<slug>` sin mostrar el mensaje de error.
4. WHEN la respuesta cambie de forma THEN los tests existentes de save-business SHALL actualizarse para reflejar el nuevo contrato sin romper.
5. IF se decide mantener compatibilidad con clientes que leen el objeto plano THEN el nuevo campo `success` SHALL agregarse sin remover las claves del negocio actuales.

### Requirement 2: Contrato y validacion de disponibilidad de slug

**User Story:** Como dueño de negocio, quiero saber si mi slug esta disponible mientras escribo, para elegir un identificador valido sin errores.

#### Acceptance Criteria

1. WHEN el frontend consulta disponibilidad de slug THEN el sistema SHALL exponer un contrato estable, ya sea `GET /api/list-businesses` devolviendo `{ businesses: [...] }` o un endpoint dedicado `GET /api/check-slug?slug=<slug>` devolviendo `{ available: boolean }`.
2. WHEN se usa `list-businesses` con parametro `q` THEN el endpoint SHALL soportar el filtro (o el frontend SHALL dejar de depender de `q` de forma silenciosa).
3. WHEN la respuesta del endpoint es inesperada o vacia THEN `app/registro/page.tsx` SHALL manejar el caso sin lanzar excepcion (no acceder a `.businesses` de `undefined`).
4. WHEN el slug ya existe THEN la UI SHALL mostrar "Ya existe un negocio con ese slug." y bloquear el avance de paso.
5. WHEN el slug esta disponible THEN la UI SHALL mostrar el indicador de disponibilidad y permitir continuar.

### Requirement 3: Retorno de pago a una URL de tiquete valida

**User Story:** Como cliente que paga el saldo desde el tiquete publico, quiero volver a mi tiquete y verlo actualizado, para confirmar que mi pago fue registrado.

#### Acceptance Criteria

1. WHEN se crea un payment intent THEN el `redirectUrl` SHALL construirse con parametros reconocidos por `TiqueteClient` (preferentemente `ticket_token`, o `number` + `slug`), mas `payment=complete`.
2. WHEN el usuario regresa del gateway THEN `TiqueteClient` SHALL cargar la orden correctamente y mostrar la retroalimentacion de pago (`success`, `pending` o `failure`).
3. IF la orden no tiene `ticket_token` disponible THEN el redirect SHALL usar `number` + `slug` obtenidos de la orden y negocio.
4. WHEN el pago retorna THEN la vista SHALL refrescar el estado de la orden (polling o fetch inmediato) para reflejar saldo actualizado.

### Requirement 4: Autorizacion del inicio de pago

**User Story:** Como operador del sistema, quiero que solo quien posee el tiquete o tiene permisos pueda iniciar pagos, para evitar que un tercero inicie pagos de ordenes ajenas conociendo el `order_id`.

#### Acceptance Criteria

1. WHEN `POST /api/create-payment-intent` recibe una peticion sin autenticacion THEN el endpoint SHALL exigir `ticket_token` y verificar que coincida con la orden referenciada por `order_id`.
2. IF `ticket_token` no coincide con la orden THEN el endpoint SHALL responder `403` sin crear el intent.
3. WHEN la peticion incluye autenticacion valida THEN el endpoint SHALL verificar permisos del usuario sobre el negocio de la orden.
4. WHEN el endpoint responde THEN NO SHALL incluir datos de cliente innecesarios (telefono, nombre) mas alla de lo requerido para el checkout.
5. WHEN se agregue esta validacion THEN SHALL existir cobertura de test para: sin token, token invalido, token valido, y usuario autorizado.

### Requirement 5: Revalidacion de custom_fields en update-order

**User Story:** Como dueño de negocio, quiero que las actualizaciones de pedido respeten mi configuracion de campos personalizados, para mantener datos consistentes y validos.

#### Acceptance Criteria

1. WHEN `update-order` recibe `custom_fields` THEN SHALL validarlos contra `businessConfig.custom_fields_config` usando la misma logica que `create-order` (`validateCustomFields`).
2. WHEN un campo requerido llega vacio THEN el endpoint SHALL responder `400` con mensaje de campo invalido.
3. WHEN un valor no pertenece al catalogo de opciones definido THEN el endpoint SHALL rechazar la actualizacion.
4. WHEN el tipo de un campo es invalido (numero esperado, texto recibido, etc.) THEN el endpoint SHALL rechazar la actualizacion.
5. WHEN los `custom_fields` son validos THEN SHALL fusionarse con los existentes y persistirse.
6. WHEN se implemente la validacion THEN SHALL existir cobertura de test para casos validos e invalidos en update.

### Requirement 6: Cota superior de `limit` en list-orders

**User Story:** Como responsable de la plataforma, quiero acotar la cantidad de ordenes devueltas, para proteger rendimiento y memoria.

#### Acceptance Criteria

1. WHEN `list-orders` recibe `limit` THEN SHALL aplicar `limit = min(200, max(1, valorNumericoValido || 100))`.
2. WHEN `limit` no es numerico o no es finito THEN SHALL usar el valor por defecto `100`.
3. WHEN `limit` excede `200` THEN SHALL truncarse a `200`.
4. WHEN se implemente la cota THEN SHALL existir cobertura de test para valores bajo, sobre el maximo, y no numericos.

### Requirement 7: Consistencia de cache local tras mutaciones en el panel

**User Story:** Como operador, quiero que la lista de pedidos del panel refleje siempre el ultimo estado, para no actuar sobre datos desactualizados.

#### Acceptance Criteria

1. WHEN se actualiza una orden en el panel THEN el estado local (`orders`) SHALL calcularse con la version mas reciente antes de cualquier persistencia o cache.
2. IF se persiste una copia local (cache) THEN SHALL persistirse exactamente la coleccion resultante de la mutacion, no una copia previa.
3. WHEN una mutacion se completa THEN el panel SHALL poder recargar desde servidor para invalidar cache obsoleta.
4. WHEN existan discrepancias entre cache y servidor THEN la fuente de verdad SHALL ser el servidor.

### Requirement 8: Estandarizacion de respuestas de API

**User Story:** Como desarrollador del frontend, quiero un contrato de respuesta consistente, para reducir bugs de integracion.

#### Acceptance Criteria

1. WHEN se defina la convencion THEN SHALL documentarse un formato estandar (por ejemplo `{ success, data, error }` o equivalente) en la documentacion del proyecto.
2. WHEN se apliquen cambios de contrato en endpoints tocados por este spec THEN SHALL seguir la convencion acordada.
3. WHEN un endpoint publico existente ya tiene consumidores THEN el cambio SHALL ser retrocompatible o acompañado de la actualizacion del consumidor y sus tests.
4. WHEN se cambie un contrato THEN los tests de integracion asociados SHALL actualizarse en el mismo cambio.

### Requirement 9: Refactor mantenible del panel

**User Story:** Como mantenedor, quiero que `app/panel/page.tsx` este dividido en unidades cohesivas, para facilitar pruebas, performance y evolucion.

#### Acceptance Criteria

1. WHEN se refactorice el panel THEN la logica SHALL extraerse en hooks (`usePanelAuth`, `useOrders`, `useBusinessConfig`) y componentes (`OrderFormDrawer`, `QrModal`, `DeliveryPhotoModal`, `OrdersSection`, `PanelSidebar`).
2. WHEN se extraigan unidades THEN el comportamiento observable del panel SHALL permanecer equivalente (sin regresiones funcionales).
3. WHEN sea posible THEN las secciones pesadas SHALL cargarse con lazy loading.
4. WHEN se complete el refactor THEN el archivo `page.tsx` SHALL reducirse a composicion y orquestacion, sin logica de dominio embebida extensa.

### Requirement 10: Reemplazo de `window.prompt` por modales controlados

**User Story:** Como operador, quiero flujos guiados con validacion en lugar de prompts nativos, para reducir errores al capturar datos como cotizaciones.

#### Acceptance Criteria

1. WHEN una accion requiera entrada compleja (por ejemplo cotizacion / valor adicional) THEN SHALL presentarse un modal con campos validados en lugar de `window.prompt`.
2. WHEN el modal captura un valor monetario THEN SHALL validarlo (numero positivo) antes de permitir confirmar.
3. WHEN el modal muestra un mensaje que se enviara THEN SHALL incluir una vista previa antes de confirmar.
4. WHEN el usuario cancela THEN NO SHALL producirse ninguna mutacion.

### Requirement 11: Accesibilidad de modales, botones y navegacion

**User Story:** Como usuario que navega con teclado o lector de pantalla, quiero interactuar con la app de forma accesible, para usarla sin barreras.

#### Acceptance Criteria

1. WHEN se abre un modal THEN SHALL exponer `role="dialog"` y `aria-modal="true"`, mover el foco inicial al modal, cerrarse con Escape y retornar el foco al elemento que lo abrio.
2. WHEN un boton depende solo de icono o emoji THEN SHALL exponer `aria-label` descriptivo.
3. WHEN un elemento interactivo recibe foco por teclado THEN SHALL mostrar un indicador de foco visible consistente.
4. WHEN el tiquete publico comunica progreso THEN NO SHALL depender unicamente del color (SHALL incluir texto o icono de estado).
5. WHEN existan textos secundarios de bajo contraste THEN SHALL revisarse para cumplir contraste minimo legible.

### Requirement 12: Onboarding inicial y ayuda contextual

**User Story:** Como usuario nuevo, quiero una guia que me muestre las funciones principales, para operar sin capacitacion externa.

#### Acceptance Criteria

1. WHEN un negocio nuevo entra al panel por primera vez THEN SHALL ofrecerse un modo de primer uso con tareas guiadas: crear primer tiquete, cambiar estado de una orden, y enviar enlace por WhatsApp o generar QR.
2. WHEN el usuario termina `/registro` THEN SHALL mostrarse un checklist de configuracion inicial (logo, metodos de pago, tiquete demo, mensajes de WhatsApp, invitar/probar login).
3. WHEN no hay datos en una seccion (pedidos, productos, promociones, caja) THEN SHALL mostrarse un estado vacio util con la accion recomendada.
4. WHEN un formulario tiene campos complejos (saldo, abono, fecha prometida, foto de entrega, aprobaciones) THEN SHALL incluir microcopy de ayuda.
5. WHEN el usuario completa una tarea del onboarding THEN el progreso SHALL reflejarse y persistir.

### Requirement 13: Rate limiting escalable

**User Story:** Como responsable de seguridad, quiero un rate limiting consistente entre instancias, para proteger endpoints publicos en produccion serverless.

#### Acceptance Criteria

1. WHEN se implemente el nuevo rate limiter THEN SHALL usar almacenamiento compartido con TTL (por ejemplo tabla Supabase con expiracion, Upstash/Redis, o edge rate limiting).
2. WHEN se hagan multiples peticiones dentro de la ventana THEN el limite SHALL respetarse de forma consistente aunque cambien las instancias/cold starts.
3. WHEN expira la ventana THEN el contador SHALL reiniciarse.
4. WHEN se migre THEN la interfaz `checkRateLimit(key, limit, windowMs)` SHALL mantenerse compatible para los consumidores actuales.
5. WHEN se implemente THEN SHALL existir cobertura de test de ventana y expiracion contra el adaptador nuevo (con doble/mocks si aplica).

### Requirement 14: CORS diferenciado por tipo de endpoint

**User Story:** Como responsable de seguridad, quiero politicas CORS acordes al tipo de endpoint, para reducir exposicion innecesaria.

#### Acceptance Criteria

1. WHEN un endpoint es publico (tiquete, catalogo publico) THEN SHALL permitir el origen adecuado segun politica definida.
2. WHEN un endpoint es privado/administrativo THEN NO SHALL usar `Access-Control-Allow-Origin: *` de forma indiscriminada.
3. WHEN se defina la politica THEN SHALL documentarse que endpoints son publicos y cuales privados.

### Requirement 15: Cobertura de tests de integracion para flujos criticos

**User Story:** Como equipo, quiero tests de integracion sobre los flujos clave, para detectar rupturas de contrato antes de produccion.

#### Acceptance Criteria

1. WHEN se corrija el registro THEN SHALL existir test de integracion del flujo completo (`save-business` + verificacion de slug).
2. WHEN se corrija el pago THEN SHALL existir test de integracion del flujo (create-payment-intent con/ sin token, y retorno a URL valida).
3. WHEN se corrija el tiquete publico THEN SHALL existir test que verifique carga por `ticket_token` y por `number+slug`.
4. WHEN se corrija update-order THEN SHALL existir test de actualizacion de estado y de custom_fields validos/invalidos.
5. WHEN se ejecute `npm run test` THEN toda la suite (incluyendo los nuevos tests) SHALL pasar.

### Requirement 16: Duplicacion / ambiguedad del flujo admin

**User Story:** Como mantenedor, quiero claridad sobre el flujo de login admin, para evitar rutas legacy ambiguas.

#### Acceptance Criteria

1. WHEN exista el endpoint legacy `admin-login` y la UI use `auth-login` THEN SHALL documentarse cual es el flujo activo.
2. IF `admin-login` ya no se usa THEN SHALL aislarse o eliminarse de forma segura.
3. WHEN se acceda a endpoints admin THEN todos SHALL validar `superadmin` (como `validateAdminToken`).

### Requirement 17: Reduccion de `any` en entidades de dominio (mejora incremental)

**User Story:** Como desarrollador, quiero tipos de dominio en las entidades centrales, para que TypeScript detecte rupturas de contrato.

#### Acceptance Criteria

1. WHEN se toquen ordenes, negocios, configuracion, promociones o custom fields en los cambios de este spec THEN SHALL introducirse tipos de dominio para esas superficies en lugar de `any`.
2. WHEN se agreguen tipos THEN `npm run typecheck` SHALL pasar sin errores nuevos.
3. WHEN la introduccion de tipos sea de alto riesgo para un archivo grande THEN SHALL limitarse al alcance tocado por este spec (mejora incremental, no big-bang).
