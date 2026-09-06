# Pendientes — TiqueteVivo

**Última actualización:** 1 de septiembre de 2026
**Spec de referencia:** `.kiro/specs/vertical-growth-playbook/` (requirements, design, tasks, business-playbook)
**Estado de la suite:** 518 tests verdes en 55 archivos

---

## 🔴 ACCIÓN INMEDIATA para retomar (hazlo primero)

### 1. Aplicar la migración pendiente en Supabase
Falta aplicar **una** migración en el SQL Editor de Supabase:

- `supabase/migrations/033_add_approval_requests.sql`  ← **PENDIENTE**

Ya aplicadas (confirmado por el usuario):
- `031_add_payment_config.sql` ✅
- `032_add_customers.sql` ✅

> Todas son idempotentes y aditivas. El código tolera su ausencia, pero el flujo
> de Aprobación NO funcionará en local hasta aplicar la 033.

### 2. Refrescar el Service Worker en el navegador
El SW está en `tiquetevivo-v5`. Si al probar ves cambios viejos:
- Ventana InPrivate, **o**
- F12 → Application → Service Workers → Unregister → Ctrl+Shift+R

### 3. Reiniciar `npm run dev`
Para que Netlify Dev registre las funciones nuevas (`public-ticket`, `approval-decide`).

---

## ✅ Completado hasta ahora

### Fase 0 — Seguridad (ya estaba implementada; solo faltaba limpieza)
- `list-orders` y `manage-business` exigen auth de negocio.
- `.env` fuera de git; `.env.example` sin passwords reales.
- Rate limiting en endpoints públicos.
- Password de ejemplo eliminado del README.

### Fase 0.1 — Correcciones post-hardening
- **Regresión del tiquete público**: `list-orders` quedó autenticado y rompía el
  tiquete del cliente (401 → QR en blanco). Fix: nuevo endpoint público
  `netlify/functions/public-ticket.js` (rate-limited, sin auth, por slug+number).
  `tiquete.html` migrado a `public-ticket`.
- **Bug del QR en blanco**: la librería `qrcode.min.js` renderizaba una `<table>`
  con `margin:80px` que sacaba el QR del contenedor. Fix en
  `public/js/qr-renderer.js` (`normalizeQrOutput`) + eliminado el fallback
  externo a `api.qrserver.com` (fallaba en modo privado/offline).
- `pagar.html` revisado: usa `validate-payment` (público), sin problema.
- Tests de regresión: `tests/public-ticket.test.js`, `tests/qr-renderer.regression.test.js`.

### Fase 1 — Núcleo de retención
- **payment_config por negocio** (migración 031): datos de transferencia
  (Nequi/Bancolombia) ya no hardcodeados. Expuesto en `get-business-config` y
  `public-ticket`; consumido en `tiquete.html` y plantillas WhatsApp de `app.js`.
- **Entidad Customer** (migración 032): tabla `customers` + `orders.customer_id`
  + backfill idempotente. Módulo `netlify/functions/_customers.js`
  (`upsertCustomer`, `getCustomerMetrics`). Vinculado en `create-order.js`.
- **Seed demo extendido** (`scripts/seed-demo-data.js`): 1 negocio por vertical
  (`demo-*`) + 4 pedidos por negocio (order_number 1001-1004) + payment_config.

### Fase 2 — Flujo de Aprobación (Approval) — COMPLETO
- Migración `033_add_approval_requests.sql` (tabla con token, TTL 7 días, RLS).
- `netlify/functions/approval-decide.js`: GET (validar), POST decide (idempotente,
  público), POST generate (autenticado, envía WhatsApp). Rate limit 30/min.
- Templates `approval_requested` / `approval_decided` en `_template-engine.js`.
- **Panel operador**: botón "🧾 Cotización" en cada pedido (`app.js` →
  `requestApproval`).
- **Cliente, 2 superficies**: página `public/aprobar.html` (link WhatsApp) +
  bloque embebido en `tiquete.html` (aprobar/rechazar sin salir del tiquete).
- Tests: `tests/approval-decide.test.js` (12) + casos en `tests/template-engine.test.js`.

---

## ⏭️ Próximo paso sugerido (retomar aquí)

**Opción recomendada: probar el flujo Approval en local end-to-end**
1. Aplicar migración 033.
2. Reiniciar `npm run dev`.
3. En `app.html?slug=demo-mechanic`, crear un pedido con tu WhatsApp.
4. Clic en "🧾 Cotización", poner monto y descripción → llega WhatsApp con link.
5. Abrir el tiquete (`tiquete.html?slug=demo-mechanic&number=<n>`) → ver el bloque
   ámbar de cotización → Aprobar/Rechazar.
6. Verificar que el estado cambia y llega el WhatsApp de confirmación.

---

## 📋 Fase 4 — Backlog por demanda (aún NO iniciado)

Priorizar según qué vertical muestre tracción comercial:

| Tarea | Descripción | Nota |
|-------|-------------|------|
| 18 | Checklist de prendas estructurado (lavandería) | Backend `order_items` YA existe (plan paid). Falta SOLO la UI en `app.html`/`app.js`. Cambio grande de frontend, riesgo de regresión visual. |
| 19 | Foto antes/después + evidencia (calzado/celular/taller) | Reutiliza `_photo-storage.js`. |
| 20 | Recordatorios de cita/recogida (salón, guardería) | Cron nuevo reutilizando patrón de `cron-reactivation.js`. |
| 21 | Domicilios: sustitución de productos vía Approval + recompra | Reutiliza el flujo Approval ya construido. |
| 22 | Casilleros/Vivero: recordatorios (devolución/cuidado) | Similar a tarea 20. |

---

## 🗒️ Notas técnicas para recordar

- **Service Worker**: cada cambio en HTML/JS de `public/` requiere subir
  `CACHE_NAME` en `public/sw.js` (va en `v5`) para invalidar caché.
- **Tests**: `npm test` (vitest). jsdom instalado para tests de DOM
  (`qr-renderer.regression.test.js`).
- **La terminal (PSReadLine) corrompe el output largo**: para leer resultados de
  test, volcar a archivo (`> out.txt 2>&1`) y leer el archivo.
- **Migraciones**: NO se aplican solas. Ejecutar manualmente en Supabase SQL Editor.
- **Slugs demo** (tras `npm run seed:demo`): `majesty`, `domiciliospaty`, y
  `demo-{laundry,mechanic,shoe-repair,bakery,tailor,pet-daycare,courier,
  print-center,salon,gym-locker,nursery,parking}`.
- **Links de demo**: ver `.kiro/specs/vertical-growth-playbook/business-playbook.md`.
