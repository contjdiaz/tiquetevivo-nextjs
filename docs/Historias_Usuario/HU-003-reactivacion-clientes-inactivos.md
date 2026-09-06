# HU-003: Reactivación Automática de Clientes Inactivos (Smart Reminders)

| Campo | Detalle |
|---|---|
| **ID** | HU-003 |
| **Épica** | Marketing de retención automatizado |
| **Prioridad sugerida** | Media-Alta |
| **Rol principal** | Dueño de la lavandería |
| **Rol secundario** | Cliente inactivo |
| **Estado** | Propuesta |

---

## 1. Historia de Usuario

**Como** dueño de la lavandería,

**Quiero** que el sistema identifique clientes que superaron su frecuencia habitual de lavado y les envíe una notificación por WhatsApp,

**Para** incentivar su regreso con una oferta personalizada y recuperar ventas sin gestión manual.

### Valor de negocio

- Recupera ingresos de clientes que se enfrían sin darse cuenta (churn silencioso).
- Automatiza una tarea de marketing que hoy no se ejecuta por falta de tiempo.
- Personalización real (nombre + último servicio) con tasas de conversión muy superiores al mensaje genérico.
- Sinergia directa con HU-001: los datos de fidelidad enriquecen la segmentación.

---

## 2. Criterios de Aceptación

### 2.1 Originales (definidos por el negocio)

- **CA-01 — Motor de Reglas:** Un proceso programado (*Cron Job*) analiza diariamente el historial de órdenes para detectar clientes con más de X días sin registrar servicios (ej. > 30 días).
- **CA-02 — Personalización del Mensaje:** La plantilla de WhatsApp incluye el nombre del cliente y su último servicio contratado (ej. *"Hola Juan, hace 35 días lavamos tus trajes..."*).
- **CA-03 — Oferta de Reactivación:** El mensaje incluye un enlace directo a un cupón digital o tiquete especial con descuento o domicilio gratis.
- **CA-04 — Control de Spam:** El sistema no reenvía recordatorios si el cliente recibió un mensaje de reactivación en los últimos 15 días o si ya creó una nueva orden.

### 2.2 Ampliados (derivados del análisis técnico del código base)

- **CA-05 — Scheduler nativo de Netlify:** La tarea diaria es una *Netlify Scheduled Function* (`cron-reactivation.js`) con expresión cron declarada en `netlify.toml`; hora configurable, default `0 14 * * *` (9:00 a.m. Colombia).
- **CA-06 — Umbral configurable por negocio:** Los días X se configuran por negocio vía `manage-business.js` (default: 30), almacenados en configuración y expuestos en `get-business-config.js`.
- **CA-07 — Frecuencia habitual dinámica:** Además del umbral fijo, el sistema calcula el promedio histórico de días entre órdenes del cliente; se dispara cuando los días sin orden superan `max(umbral_configurado, promedio_habitual × 1.5)`. Negocios con menos de 2 órdenes por cliente usan solo el umbral fijo.
- **CA-08 — Plantillas aprobadas por Meta:** El envío fuera de la ventana de servicio de 24 h exige plantilla aprobada en WhatsApp Cloud API; un rechazo de plantilla se registra como error sin reintentar automáticamente.
- **CA-09 — Anti-spam reforzado:** Bloqueo doble verificado contra `reactivation_log`: (a) último recordatorio enviado hace < 15 días, o (b) existe orden creada posterior al último servicio del cliente. Ambas condiciones son independientes y bloqueantes.
- **CA-10 — Opt-out persistente:** Si el cliente responde "STOP"/"SALIR", queda marcado como `marketing_opt_in = false` y ningún flujo posterior le envía mensajes promocionales (los transaccionales de sus órdenes sí continúan).
- **CA-11 — Cupón único rastreable:** Cada envío genera código/token de cupón de un solo uso con expiración; la URL lo lleva al tiquete/cupón digital y permite atribución completa enviado → clic → orden creada.
- **CA-12 — Logging integral:** Todo intento (exitoso o fallido) queda registrado en la tabla existente `whatsapp_messages` siguiendo el patrón actual de `_whatsapp.js`.
- **CA-13 — Horario permitido:** Solo se envía entre 8:00 y 20:00 hora local Colombia; registros fuera de rango se posponen a la siguiente ejecución válida (protección de calidad de número ante Meta).
- **CA-14 — Límites por plan freemium:** Plan `free`: máximo N recordatorios/mes (default 10); plan `paid`: límite configurable superior. Coherente con la matriz de planes del roadmap.
- **CA-15 — Resiliencia:** Fallos de API con reintento exponencial limitado (máx. 3); errores finales marcados en log para revisión. La ejecución puede dispararse manualmente desde el panel admin para pruebas.
- **CA-16 — Métricas consultables:** El panel permite ver por campaña: enviados, entregados, clics y conversiones (órdenes atribuidas al cupón).

---

## 3. Notas Técnicas

> Referencias a archivos reales del repositorio.

### Scheduled Function

```javascript
// netlify/functions/cron-reactivation.js
export const handler = async () => { /* lógica diaria */ };
export const config = {
  name: "cron-reactivation",
  schedule: "@daily" // o expresión cron definida en netlify.toml
};
```

Alternativa declarativa en `netlify.toml`:

```toml
[[functions]]
  name = "cron-reactivation"
  schedule = "0 14 * * *"
```

### Base de datos — Migración `supabase/migrations/013_add_reactivation.sql`

```sql
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text not null unique,
  type text not null check (type in ('PERCENT','AMOUNT','FREE_DELIVERY')),
  value numeric(12,2) not null default 0,
  expires_at timestamptz,
  used_at timestamptz,
  used_by_order_id uuid references orders(id),
  created_at timestamptz not null default now()
);

create table if not exists reactivation_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone text not null,
  coupon_id uuid references coupons(id),
  sent_at timestamptz not null default now(),
  clicked_at timestamptz,
  converted_order_id uuid references orders(id),
  status text not null default 'SENT'
    check (status in ('SENT','DELIVERED','READ','FAILED','CONVERTED'))
);

create index if not exists reactivation_log_phone_idx on reactivation_log (phone, sent_at desc);
```

El opt-out (CA-10) puede vivir como columna `marketing_opt_in boolean default true` sobre la futura tabla de clientes o sobre `customer_loyalty` (HU-001), evitando tablas redundantes.

### Reutilización del código existente

| Componente existente | Uso en esta HU |
|---|---|
| `_whatsapp.js` (`sendWhatsAppMessage`) | Envío real vía Cloud API con logging automático |
| `_template-engine.js` | Nuevo trigger `customer_reactivation` con variables `{customer_name}`, `{last_service}`, `{days_inactive}`, `{coupon_link}` |
| `_validators.js::validatePhone` | Normalización para segmentar y deduplicar destinatarios |
| Tabla `whatsapp_messages` | Auditoría CA-12 sin cambios de esquema |
| Variables `.env` `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Ya definidas en README (hoy vacías: prerequisito) |

### Consulta de segmentación (pseudo-SQL)

```sql
select customer_phone, customer_name,
       max(created_at) as last_order_at,
       avg(created_at - lag(created_at) over (partition by customer_phone order by created_at)) as avg_freq
from orders
where business_id = $1 and status <> 'CANCELLED'
group by customer_phone, customer_name;
-- Filtro final: dias_desde_ultima > max(umbral, avg_freq * 1.5)
-- Exclusiones CA-09: LEFT JOIN reactivation_log y orders posteriores
```

---

## 4. Definición de Terminado (DoD)

- [ ] Migración `013_add_reactivation.sql` aplicada y verificada.
- [ ] Scheduled Function registrada y ejecutándose en Netlify (verificable en logs de función).
- [ ] Tests vitest: regla de segmentación (umbral fijo vs frecuencia dinámica CA-07), anti-spam doble condición (CA-09), opt-out (CA-10), horario permitido (CA-13), límites por plan (CA-14).
- [ ] Test de plantilla: renderizado con datos completos y con datos faltantes (fallback seguro).
- [ ] `npm run check` y `npm test` verdes.
- [ ] Prueba E2E manual documentada: seed de cliente inactivo → ejecución manual → mensaje recibido en sandbox → conversión atribuida.
- [ ] Plantilla(s) aprobadas por Meta adjuntas/referenciadas en `docs/`.

## 5. Dependencias y Prerrequisitos

- **Credenciales activas de Meta WhatsApp Cloud API** (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`): hoy existen en `.env.example` pero están vacías.
- **Plantillas aprobadas por Meta** para mensajería fuera de ventana 24 h (aprobación típica 24–48 h).
- Historial suficiente de órdenes por negocio para calcular frecuencia habitual (mínimo recomendado: 2 órdenes/cliente; si no, cae al umbral fijo).
- Decisión comercial: valores de cupón (ej. 10% dcto / domicilio gratis) y duración de vigencia.
- Recomendable implementar después de HU-001 para aprovechar `customer_loyalty.phone_number` como base de clientes.

## 6. Métricas de Éxito

| Métrica | Objetivo inicial |
|---|---|
| Tasa de conversión reminder → orden | ≥ 10% primer trimestre |
| % mensajes entregados vs enviados | ≥ 95% |
| Ingresos recuperados atribuidos a cupones | Trazable y creciente mes a mes |
| Reducción de clientes inactivos > 60 días | −20% a 3 meses |
| Reclamos de spam / bloqueos de número | 0 incidentes de calidad baja en Meta |

## 7. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| Degradación de calidad del número ante Meta por exceso de envíos | Alto | Media | Límites diarios/mensuales (CA-14), horario restringido (CA-13), plantillas aprobadas (CA-08), opt-out (CA-10) |
| Costos por mensaje de plantilla | Medio | Alta | Presupuesto por plan y monitoreo mensual de consumo |
| Mensajes mal personalizados (datos vacíos) | Bajo | Media | Fallback validado en template engine (nombre genérico, servicio omitido) antes de enviar |
| Abuso de cupones (reuso/compartición) | Medio | Media | Código único de un uso + expiración (CA-11) |
| Cron no ejecutado por incidencia de plataforma | Medio | Baja | Disparo manual desde panel admin (CA-15) + alerta si no hay corrida en 48 h |
| Envíos duplicados tras despliegues simultáneos | Medio | Baja | Verificación transaccional contra `reactivation_log` justo antes de cada envío |
