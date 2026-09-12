# Contratos de API, CORS y flujo admin — TiqueteVivo

Este documento formaliza la convencion de respuestas, la clasificacion de
endpoints publicos/privados para CORS, y el flujo de autenticacion admin.
Cubre las tareas 13.2, 13.3, 14.1 y 14.2 del spec `app-quality-improvements`.

## 1. Convencion de respuesta de API (Req 8.1)

Los endpoints tocados por este spec usan una forma de respuesta consistente:

### Exito

```jsonc
// Recurso unico
{ "success": true, "business": { /* ... */ } }

// Coleccion
{ "businesses": [ /* ... */ ] }

// Verificacion booleana
{ "available": true }
```

Reglas:

- Las mutaciones que devuelven un recurso incluyen `success: true` mas la entidad
  bajo una clave con nombre de dominio (`business`, `order`, ...).
- Las colecciones se envuelven en un objeto con una clave plural
  (`{ businesses: [...] }`, `{ orders: [...] }`) en lugar de un array plano,
  para permitir agregar metadatos (paginacion, totales) sin romper consumidores.
- Las verificaciones simples devuelven el booleano nombrado (`{ available }`).

### Error

```jsonc
{ "success": false, "message": "Texto legible", "field": "slug" }
// o, en endpoints heredados:
{ "error": true, "message": "Texto legible" }
```

Reglas:

- `4xx` para errores de validacion o autorizacion; `5xx` para errores internos.
- No se filtran detalles sensibles (stack traces, existencia de recursos ajenos).
- Cuando se toque un endpoint existente, se agrega `success`/`message` sin remover
  las claves ya consumidas, o se actualiza el consumidor y sus tests en el mismo
  cambio (Req 8.3, 8.4).

### Retrocompatibilidad (Req 8.3, 14.2)

Cambios de contrato aplicados por este spec y sus consumidores:

| Endpoint            | Antes                     | Ahora                                | Consumidor actualizado                |
| ------------------- | ------------------------- | ------------------------------------ | ------------------------------------- |
| `save-business`     | objeto plano del negocio  | `{ success: true, business }`        | `app/registro/page.tsx`               |
| `list-businesses`   | array plano               | `{ businesses: [...] }`              | consumidores de listado               |
| `check-slug` (nuevo)| —                         | `{ available: boolean }`             | `app/registro/page.tsx` (`checkSlug`) |
| `create-payment-intent` | redirect a `order=<id>` | redirect con `ticket_token` / `number+slug` + `payment=complete` | `app/tiquete/TiqueteClient.tsx` |

## 2. Clasificacion de endpoints para CORS (Req 14.1, 14.2, 14.3)

CORS diferenciado implementado en `lib/api/_cors.ts` con dos clases:

- **public** — `Access-Control-Allow-Origin: *`. Endpoints consumidos por el
  cliente final sin autenticacion, desde dominios variados.
- **private** — refleja el origen solo si esta en la allowlist `ALLOWED_ORIGINS`
  (fallback a `APP_URL`/`NEXT_PUBLIC_APP_URL`). Nunca usa `*`. Incluye
  `Access-Control-Allow-Credentials: true` y `Vary: Origin`.

### Endpoints publicos

Tiquete y catalogo/consulta sin login:

- `public-ticket`, `public-catalog`, `get-business-config`
- `check-slug`, `list-businesses`
- `order-status`, `ticket-recovery`
- `validate-coupon`, `redeem-coupon`, `validate-payment`
- `submit-quote`, `save-lead`
- `create-order`, `create-payment-intent`, `update-order` (protegidos por
  `ticket_token`/auth a nivel de logica, pero accesibles desde el navegador del
  cliente; se mantienen como public a nivel CORS)
- `payments-webhook` (invocado por el gateway; sin restriccion de origen navegador)

### Endpoints privados/administrativos

Consumidos solo desde el panel/consola admin con sesion:

- `admin-businesses`, `admin-orders`, `admin-stats`, `admin-verticals`,
  `admin-whatsapp-logs`
- `admin-login` (heredado, ver seccion 3)

Estos endpoints usan `adminJson(event, status, body)` (en `lib/api/_admin-auth.ts`),
que aplica CORS `private` reflejando el `Origin` contra la allowlist.

### Configuracion

```bash
# .env
ALLOWED_ORIGINS=https://tiquetevivo.com,https://app.tiquetevivo.com
# o, si no se define, se usa:
APP_URL=https://tiquetevivo.com
```

## 3. Flujo de autenticacion admin (Req 16.1, 16.2, 16.3)

### Flujo activo

- **Login de operadores/dueños:** la UI usa `POST /api/auth-login` (Supabase Auth).
  Este es el flujo activo para el panel.
- **Acceso admin/superadmin:** los endpoints `admin-*` validan la sesion con
  `validateAdminToken` (`lib/api/_admin-auth.ts`), que exige rol `superadmin`
  activo en `business_users` (o el token admin heredado firmado con
  `ADMIN_PASSWORD`). Se cumple Req 16.3: todos los `admin-*` validan superadmin.

### `admin-login` (heredado)

- `POST /api/admin-login` es un flujo heredado basado en `ADMIN_PASSWORD`.
- **Estado:** deprecado. No es el flujo principal; se conserva por
  compatibilidad con el token admin firmado que aun acepta `validateAdminToken`.
- **Recomendacion:** migrar cualquier consola admin a Supabase Auth
  (`auth-login`) con rol `superadmin`, y luego retirar `admin-login`.
