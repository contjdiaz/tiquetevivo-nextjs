# HU-002: Conciliación Automática de Pagos (Wompi / Bold)

| Campo | Detalle |
|---|---|
| **ID** | HU-002 |
| **Épica** | Pagos digitales y conciliación financiera |
| **Prioridad sugerida** | Crítica |
| **Rol principal** | Cajero / Administrador de la lavandería |
| **Rol secundario** | Cliente final |
| **Estado** | Propuesta |

---

## 1. Historia de Usuario

**Como** cajero o administrador de la lavandería,

**Quiero** que el tiquete digital valide el pago mediante pasarela (Nequi, PSE, Tarjeta) e informe el resultado al sistema,

**Para** cambiar el saldo a $0 y marcar la orden como `PAGADA` en tiempo real sin requerir soporte manual de comprobantes.

### Valor de negocio

- Elimina el soporte manual de comprobantes (capturas de pantalla, llamadas) que hoy consume horas del cajero.
- Reduce errores de digitación y fraude por comprobantes falsos.
- Cierre de caja confiable y conciliable contra el reporte de la pasarela.
- Mejora la experiencia del cliente: paga desde su celular en el momento que lo decida.

---

## 2. Criterios de Aceptación

### 2.1 Originales (definidos por el negocio)

- **CA-01 — Botonera de Pago:** La vista del tiquete (`public/tiquete.html`) muestra el botón "Pagar Saldo Pendiente" si la orden tiene `balance > 0`.
- **CA-02 — Procesamiento:** El cliente completa la transacción a través de la pasarela (Wompi/Bold) sin salir del flujo del tiquete.
- **CA-03 — Webhook de Confirmación:** El backend recibe el evento de pago exitoso (`transaction.updated` / `status: APPROVED`) desde la pasarela.
- **CA-04 — Sincronización:** La orden cambia su estado financiero a pagado en el tablero Kanban en tiempo real (WebSockets o polling), notificando al empleado en pantalla.

### 2.2 Ampliados (derivados del análisis técnico del código base)

- **CA-05 — Validación de firma server-side obligatoria:** Ninguna actualización de BD ocurre sin validar la firma/checksum del webhook server-side (Wompi: checksum SHA256 sobre concatenación de propiedades + secreto de integridad; Bold: HMAC-SHA256 en header `x-bold-signature`). Webhook sin firma válida → respuesta `401` sin procesar.
- **CA-06 — Idempotencia de webhooks:** Eventos duplicados de la misma transacción (`gateway_transaction_id` único) no aplican doble abono al saldo.
- **CA-07 — Coincidencia exacta de monto:** El monto aprobado (ej. `amount_in_cents`) debe coincidir con el `balance` vigente de la orden; discrepancia → estado `MANUAL_REVIEW` sin aplicar abono automático.
- **CA-08 — Estados no aprobados:** Transacciones `DECLINED`, `VOIDED` o `PENDING` actualizan el registro de pago y la UI informativa del tiquete, pero nunca modifican `paid`/`balance`.
- **CA-09 — Pagos parciales:** Se soporta abono parcial (`paid += amount`); el estado "pagado" se alcanza únicamente cuando `balance = 0` (columna generada ya existente en `orders`).
- **CA-10 — Fuente única de verdad:** Solo el webhook validado marca el pago; las confirmaciones client-side (redirect con parámetros) son solo informativas y jamás actualizan la BD.
- **CA-11 — Tiempo real vía polling existente:** `public/js/status-poller.js` (que ya consulta `/api/order-status?number=&slug=`) refleja el cambio a pagado sin recargar la página; WebSockets queda como mejora futura.
- **CA-12 — Notificación WhatsApp:** Al confirmarse un pago se envía mensaje al cliente reutilizando `_whatsapp.js` + nuevo trigger `payment_confirmed` en `_template-engine.js`; queda registrado en `whatsapp_messages`.
- **CA-13 — Auditoría completa:** Toda transacción se persiste con su `raw_payload` original para conciliación contable posterior contra el portal de la pasarela.
- **CA-14 — Entornos sandbox/test:** Llaves de prueba separadas por variables de entorno (`WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `BOLD_API_KEY`, `BOLD_SECRET`) con modo sandbox activable sin tocar código.
- **CA-15 — Webhooks tardíos sobre órdenes canceladas:** Si llega confirmación de pago para una orden `CANCELLED`, no se marca como pagada; se registra en `MANUAL_REVIEW` y se alerta para gestión de reembolso.

---

## 3. Notas Técnicas

> Referencias a archivos reales del repositorio. El redirect genérico `/api/*` → `/.netlify/functions/:splat` de `netlify.toml` aplica automáticamente a los endpoints nuevos.

### Nuevas Netlify Functions

| Archivo | Responsabilidad |
|---|---|
| `netlify/functions/payments-webhook.js` | Endpoint público `/api/payments/webhook`. Valida firma → deduplica → aplica pago idempotente. Sin JWT (excepción de seguridad documentada). |
| `netlify/functions/create-payment-intent.js` | Genera intención/enlace de pago (Checkout Web Wompi o Link Bold) para una orden. Protegida con `requireAuth` cuando la invoca el panel; versión pública firmada (token efímero) para `tiquete.html`. |
| `netlify/functions/_payments.js` | Módulo compartido: `verifyWompiSignature()`, `verifyBoldSignature()`, `applyApprovedPayment()` (transaccional: insert payment + update order paid). |

### Base de datos — Migración `supabase/migrations/012_add_payments.sql`

```sql
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  gateway text not null check (gateway in ('WOMPI','BOLD')),
  gateway_transaction_id text not null unique,   -- idempotencia CA-06
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'COP',
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','DECLINED','VOIDED','ERROR','MANUAL_REVIEW')),
  raw_payload jsonb,                             -- auditoría CA-13
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_idx on payments (order_id);
```

### Integración existente aprovechada

- `orders.balance` es columna generada (`greatest(total - paid, 0)`) en `supabase/schema.sql`: basta actualizar `paid`.
- `public/tiquete.html` ya renderiza saldo y llama `/api/update-order`; se agrega bloque condicional de botonera según CA-01.
- `public/js/status-poller.js` ya implementa polling ligero: ampliar respuesta de `order-status.js` con `payment_status`.
- `_template-engine.js`: registrar trigger `payment_confirmed` siguiendo patrón de `status_ready`.

### Flujo resumido

1. `tiquete.html` detecta `balance > 0` → muestra botón (CA-01).
2. `create-payment-intent.js` devuelve URL de checkout de la pasarela.
3. Pasarela procesa y dispara `POST /api/payments/webhook`.
4. `payments-webhook.js`: valida firma (CA-05) → verifica idempotencia (CA-06) → compara montos (CA-07) → aplica o marca revisión (CA-08/09/15).
5. Polling del tiquete y del tablero refrescan estado (CA-04/11).

---

## 4. Definición de Terminado (DoD)

- [ ] Migración `012_add_payments.sql` aplicada y verificada.
- [ ] Tests vitest: validación de firma (válido/inválido/ausente), idempotencia ante webhooks duplicados, coincidencia de monto, estados DECLINED/VOIDED, pagos parciales, webhook tardío sobre orden cancelada.
- [ ] Test E2E manual en sandbox Wompi/Bold documentado en `GUIA_PRUEBA_LOCAL.md`.
- [ ] `npm run check` y `npm test` verdes (agregar nuevas funciones al script).
- [ ] Documentada la excepción de autenticación del endpoint webhook (sin JWT, con firma).
- [ ] Verificación manual: pago sandbox → saldo $0 → tablero refleja pagado < 10 s.

## 5. Dependencias y Prerrequisitos

- Cuenta activa y credenciales de Wompi y/o Bold (sandbox primero, producción después).
- URL pública HTTPS del sitio Netlify registrada como endpoint de webhook en los dashboards de las pasarelas.
- Decisión comercial: se recomienda implementar **Wompi primero** (mayor cobertura Nequi/PSE) y Bold como segunda integración reutilizando el patrón.
- Migraciones 001–010 aplicadas.

## 6. Métricas de Éxito

| Métrica | Objetivo inicial |
|---|---|
| Órdenes conciliadas automáticamente sin intervención humana | ≥ 95% |
| Latencia entre pago aprobado y actualización en tablero | < 10 segundos |
| Comprobantes manuales gestionados por semana | Reducción ≥ 90% vs línea base |
| Discrepancias detectadas en conciliación mensual | 0 sin resolver |
| Webhooks rechazados por firma inválida | Monitoreado; picos = posible ataque |

## 7. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| Fraude por manipulación de monto client-side | Alto | Media | Comparación estricta server-side del monto aprobado vs balance (CA-07) |
| Replay attack de webhooks | Alto | Baja | Firma + timestamp + idempotencia por `gateway_transaction_id` |
| Eventos fuera de orden (VOIDED tras APPROVED) | Medio | Media | Comparar secuencia/`updated_at` del evento antes de aplicar cambios |
| Caída o latencia de la pasarela | Medio | Media | Mantener flujo actual de cobro manual como fallback operativo |
| Costo por transacción erosionando margen | Medio | Alta | Visible al negocio; decisión de recargo/absorción documentada |
| Doble integración simultánea eleva complejidad | Medio | Media | Abstraer en `_payments.js`; una pasarela en v1, segunda reusa patrón |
