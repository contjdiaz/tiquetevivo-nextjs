# HU-001: Fidelización y Tarjeta de Sellos Digitales

| Campo | Detalle |
|---|---|
| **ID** | HU-001 |
| **Épica** | Retención y fidelización de clientes |
| **Prioridad sugerida** | Alta |
| **Rol principal** | Cliente final de la lavandería |
| **Rol secundario** | Operador / Dueño del negocio |
| **Estado** | Propuesta |

---

## 1. Historia de Usuario

**Como** cliente de la lavandería,

**Quiero** ver un contador de sellos digitales directamente en el tiquete de mi orden al escanear el código QR,

**Para** acumular visitas por mis lavados y obtener beneficios automáticamente sin llevar tarjetas físicas de papel.

### Valor de negocio

- Incrementa la recurrencia de visitas: el cliente visualiza su progreso hacia el premio en cada consulta del tiquete.
- Elimina el costo y la pérdida asociados a tarjetas físicas de papel.
- Genera datos de comportamiento (frecuencia, antigüedad) reutilizables por otras funcionalidades (ej. HU-003 Smart Reminders).
- Diferenciador competitivo frente a lavanderías tradicionales sin programa digital.

---

## 2. Criterios de Aceptación

### 2.1 Originales (definidos por el negocio)

- **CA-01 — Visualización:** La vista web del tiquete (`public/tiquete.html`, ruta `/tiquete/[id]`) muestra una barra visual de progreso o grilla de sellos (ej. 1 al 5).
- **CA-02 — Actualización Automática:** Al marcar una orden como `DELIVERED` (Entregada) en el panel del comercio (`/api/update-order`), el sistema suma +1 sello al perfil del cliente asociado a su número de teléfono.
- **CA-03 — Redención de Premio:** Al alcanzar el objetivo (ej. quinto sello), el tiquete despliega una notificación prominente con un código o banner de descuento para su próxima visita.
- **CA-04 — Persistencia:** El historial de sellos se almacena vinculado al cliente (teléfono normalizado) independientemente de la sede o dispositivo desde donde consulte.

### 2.2 Ampliados (derivados del análisis técnico del código base)

- **CA-05 — Idempotencia de sellos:** Un mismo `order_id` genera como máximo un sello, aunque el estado de la orden cambie varias veces (ej. `DELIVERED` → `READY` → `DELIVERED`). Se garantiza con índice único parcial sobre eventos tipo `STAMP`.
- **CA-06 — Reversión automática:** Si una orden que ya generó sello pasa a estado `CANCELLED`, el sello se revierte automáticamente (evento `REVERT`) sin dejar saldos negativos.
- **CA-07 — Exclusión de canceladas:** Las órdenes en estado `CANCELLED` nunca generan sello.
- **CA-08 — Objetivo configurable:** El número de sellos para el premio (N) es configurable por negocio (default: 5) mediante `manage-business.js` y se expone en `get-business-config.js`.
- **CA-09 — Normalización de teléfono:** El teléfono del cliente se normaliza reutilizando `_validators.js::validatePhone()` antes de buscar/crear el perfil de fidelidad, evitando perfiles duplicados por formato (`+57...`, espacios, guiones).
- **CA-10 — Minimización de datos en API pública:** La respuesta pública solo incluye `{ stamps_count, stamps_target, reward_available }`; nunca expone PII adicional del cliente ni datos internos de la tabla.
- **CA-11 — Redención única con auditoría:** Un premio puede redimirse una sola vez; el canje registra `redeemed_at`, `order_id` de aplicación y usuario operador que valida (rol `operator`/`owner` vía JWT existente).
- **CA-12 — UI responsive y accesible:** La grilla de sellos es responsive en móvil y usa atributos ARIA (`aria-label="Sello 3 de 5"`) para lectores de pantalla.

---

## 3. Notas Técnicas

> Referencias a archivos reales del repositorio (rama `ft/single-business-view`).

### Base de datos — Migración `supabase/migrations/011_add_customer_loyalty.sql`

```sql
create table if not exists customer_loyalty (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,          -- ya normalizado (solo dígitos)
  total_stamps integer not null default 0,
  available_rewards integer not null default 0,
  last_stamp_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_events (
  id uuid primary key default gen_random_uuid(),
  loyalty_id uuid not null references customer_loyalty(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  event_type text not null check (event_type in ('STAMP','REVERT','REDEEM')),
  created_at timestamptz not null default now()
);

-- Idempotencia CA-05: máximo un STAMP por orden
create unique index if not exists loyalty_events_one_stamp_per_order
  on loyalty_events (order_id)
  where event_type = 'STAMP';

-- Configuración por negocio
alter table businesses add column if not exists loyalty_config jsonb
  not null default '{"enabled": true, "target": 5}';
```

Patrón RLS idéntico al resto del schema: políticas públicas de lectura, escritura solo vía `service_role` desde Netlify Functions.

### Backend

| Archivo | Cambio |
|---|---|
| `netlify/functions/update-order.js` | Al transicionar a `DELIVERED` (verificando estado previo en BD): upsert en `customer_loyalty` + insert `loyalty_events`. Al pasar a `CANCELLED` con sello previo: evento `REVERT`. |
| `netlify/functions/list-orders.js` | Incluir bloque `loyalty` en la respuesta usada por `tiquete.html` (ya consulta `/api/list-orders?slug=...&include_business=1`). |
| `netlify/functions/get-business-config.js` | Exponer `loyalty_config` (target, enabled). |
| `netlify/functions/manage-business.js` | Permitir editar `loyalty_config` (owner/admin). |

### Frontend

- `public/tiquete.html`: renderizar grilla/barras de sellos + banner de premio con confeti (reutilizar `public/js/confetti.js`).
- Opcional: extraer widget a `public/js/loyalty-widget.js` para reuso.
- El polling existente `public/js/status-poller.js` refresca sellos cuando cambia el estado.

### Decisiones abiertas

- Alcance multi-negocio: recomendado clave global por teléfono (plataforma), coherente con CA-04 "independientemente de la sede".
- Vigencia/expiración de sellos (v2, requiere `expires_at` en eventos).
- Gating freemium: decidir si fidelización es exclusiva de plan `paid` (patrón existente en Fase 3 del roadmap).

---

## 4. Definición de Terminado (DoD)

- [ ] Migración `011_add_customer_loyalty.sql` aplicada en Supabase y verificada en Table Editor.
- [ ] Tests unitarios vitest para: idempotencia (CA-05), reversión (CA-06), exclusión de canceladas (CA-07).
- [ ] Test de propiedad fast-check para teléfonos (siguiendo patrón de `tests/validators.phone.property.test.js`).
- [ ] `npm run check` pasa (agregar nuevos archivos `.js` de funciones al script si aplica).
- [ ] `npm test` verde.
- [ ] Verificación manual: crear orden → entregar → escanear QR → sello visible en `tiquete.html`.
- [ ] README y/o `docs/` actualizados con el nuevo endpoint/campo.

## 5. Dependencias y Prerrequisitos

- Migraciones 001–010 aplicadas (en particular `010_add_order_items.sql`, pendiente de commit en rama actual).
- Autenticación operativa (Fase 4 completada) para auditar redenciones.
- Decisión de negocio sobre alcance multi-sede y gating freemium (ver §3).

## 6. Métricas de Éxito

| Métrica | Objetivo inicial |
|---|---|
| % clientes recurrentes con ≥ 1 sello activo | ≥ 40% a 3 meses |
| Tasa de retorno a 30 días tras sumar sello | ≥ 25% |
| % premios emitidos que se redimen | 50–80% (fuera de rango = revisar reglas) |
| Frecuencia media de lavado mensual por cliente activo | +15% vs línea base |

## 7. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| Doble conteo por toggles de estado | Alto | Media | Índice único parcial (CA-05) + tests de idempotencia |
| Teléfonos duplicados por formato | Medio | Alta | Normalización centralizada con `validatePhone()` (CA-09) |
| Fraude interno (sellos manuales indebidos) | Medio | Baja | Auditoría completa en `loyalty_events` + rol requerido para canje |
| Exposición de PII en API pública | Alto | Baja | Respuesta mínima definida en CA-10 + revisión de seguridad |
| Abuso de códigos de premio | Medio | Media | Redención única registrada y trazable a orden (CA-11) |
