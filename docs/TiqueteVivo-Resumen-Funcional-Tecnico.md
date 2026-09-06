# TiqueteVivo — Resumen Funcional y Técnico

**Proyecto:** TiqueteVivo (prototipo multi-negocio)  
**Repositorio:** https://github.com/contjdiaz/tiquetevivo-maktub  
**Deploy:** Netlify (estático + Functions)  
**Fecha del análisis:** 29 de agosto de 2026  

---

## 1. Resumen Funcional

### ¿Qué es TiqueteVivo?
Plataforma de **recibos/tiquetes digitales** orientada a negocios de servicio en Colombia (lavanderías, zapaterías, parqueaderos, talleres, pastelerías y similares).

Objetivo principal:
- Eliminar el tiquete físico de papel.
- Entregar un recibo digital por WhatsApp.
- Permitir al cliente ver estado, saldo y mostrar un QR al recoger.
- Dar al negocio control centralizado de pedidos, saldos y fidelización.

### Funcionalidades principales

| Módulo | Descripción |
|--------|-------------|
| **Tiquetes digitales** | Creación de pedidos desde el panel (`app.html`). El cliente recibe un link/QR único. |
| **Seguimiento de estados** | Flujo configurable por vertical (ej: Recibido → En Proceso → Listo → Entregado). |
| **QR inteligente** | 4 modos: Rastrear, Recoger, Pagar, Reseña. Cambia automáticamente según estado y saldo. |
| **WhatsApp** | Envío automático de recibo y notificaciones de cambio de estado (Cloud API de Meta). |
| **Pagos** | Conciliación de saldos. Integración con Wompi y Bold. Botón de pago y medios de transferencia. |
| **Fidelidad (Loyalty)** | Sellos digitales. Al completar el objetivo se genera recompensa. |
| **Reactivación** | Cron diario que detecta clientes inactivos y envía mensajes con cupones. |
| **Multi-negocio / Vertical** | Cada negocio tiene su `slug`, configuración de estados, emoji de vertical y campos personalizados. |
| **Evidencia fotográfica** | Fotos al recibir y al entregar (plan paid). |
| **Confirmaciones digitales** | El cliente puede confirmar recepción/entrega conforme. |

### Nicho de mercado
- Tiendas de barrio
- Lavanderías
- Zapaterías
- Parqueaderos
- Talleres y otros negocios de servicio

### Propuesta de valor
- Cero papel
- Menos llamadas repetidas (“¿ya está listo?”, “¿cuánto debo?”)
- Cobros más claros (saldo visible)
- Imagen más profesional
- Marketing recurrente vía mini-landing del negocio (idea en desarrollo)

---

## 2. Resumen Técnico

### Stack

| Capa | Tecnología |
|------|------------|
| Frontend | HTML + JavaScript vanilla (sin framework) |
| Estilos | CSS vanilla embebido en cada página |
| Backend | Netlify Functions (Node.js) |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth + roles por negocio |
| WhatsApp | Meta Cloud API |
| Pagos | Wompi y/o Bold |
| Deploy | Netlify (publish: `public`, functions: `netlify/functions`) |

### Estructura del repositorio

```
tiquetevivo-maktub/
├── public/                     # Frontend estático
│   ├── index.html              # Landing comercial
│   ├── app.html                # Panel de administración
│   ├── tiquete.html            # Página del tiquete del cliente (clave)
│   ├── admin.html
│   ├── registro.html
│   ├── js/
│   │   ├── qr-payload.js
│   │   ├── qr-renderer.js
│   │   ├── qr-mode-selector.js
│   │   ├── status-poller.js
│   │   ├── loyalty-widget.js
│   │   ├── payment-button.js
│   │   ├── confetti.js
│   │   └── ...
│   └── ...
├── netlify/functions/          # Backend serverless
│   ├── create-order.js
│   ├── list-orders.js
│   ├── update-order.js
│   ├── get-business-config.js
│   ├── whatsapp-sender.js
│   ├── payments-webhook.js
│   ├── cron-reactivation.js
│   └── _*.js (módulos compartidos)
├── supabase/
│   ├── schema.sql
│   └── migrations/
├── netlify.toml
└── package.json
```

### Flujo principal del tiquete

1. El negocio crea el pedido desde `app.html`.
2. Se genera un link:  
   `tiquete.html?number=XXXX&slug=nombre-negocio`
3. Se envía por WhatsApp al cliente.
4. El cliente abre el link → carga datos vía `/api/list-orders?slug=...&include_business=1`.
5. Se renderiza:
   - Header del negocio
   - Stepper de estados
   - Detalle del servicio + saldo
   - QR dinámico (4 modos)
   - Botones de acción (WhatsApp, pagar, compartir)
6. Un **status poller** consulta periódicamente cambios de estado y actualiza la UI en tiempo real.

### Módulos clave del QR

- `qr-payload.js` → Genera el contenido del QR según el modo.
- `qr-renderer.js` → Dibuja el QR con colores distintos por modo.
- `qr-mode-selector.js` → Decide el modo por defecto según estado + saldo.
- `status-poller.js` → Actualiza el tiquete sin recargar la página.

### Multi-negocio y verticales

Cada negocio se identifica por `slug`.  
La configuración incluye:
- `status_flow_config` (pasos del flujo)
- `vertical_emoji`
- `custom_fields_config`
- `loyalty_config`
- `services_config` (aún poco explotado en el tiquete público)

El endpoint `get-business-config` expone datos públicos de forma segura.

---

## 3. Estado actual de la página del tiquete (`tiquete.html`)

### Fortalezas
- Diseño mobile-first.
- QR con 4 modos inteligentes.
- Actualización en tiempo real.
- Soporte de fidelidad, fotos y confirmaciones.
- Preparado para multi-negocio.

### Debilidades de UI/UX
- Demasiada información al mismo nivel (scroll largo).
- El **QR no es protagonista** (está al final).
- Medios de pago hardcodeados (Nequi/Bancolombia).
- No existe aún la **mini-landing del negocio** (servicios, redes, horarios).
- Secciones secundarias (fotos, confirmaciones, políticas) siempre visibles.
- CSS vanilla difícil de mantener a medida que crece.

---

## 4. Mejoras recomendadas (priorizadas)

### Prioridad Alta
1. **Reordenar la estructura visual** del tiquete:
   - Header negocio
   - Estado actual
   - Resumen + Saldo pendiente (acción clara)
   - **QR grande y protagonista**
   - Acciones rápidas (Pagar / WhatsApp / Compartir)
   - Mini-landing del negocio
   - Secciones colapsables (Más detalles, Fidelidad, Políticas)

2. Hacer el QR más grande (180-200px) y con texto fuerte:  
   *“Tu llave digital – Muéstralo al recoger”*

3. Convertir el tiquete en **mini-landing del negocio** (servicios, redes sociales, horarios, ubicación).

### Prioridad Media
4. Medios de pago dinámicos (tomar datos del negocio).
5. Extender `get-business-config` para devolver perfil público (redes, horario, dirección, servicios).
6. Ocultar tabs del QR cuando solo hay un modo relevante.

### Prioridad Baja / Futuro
7. Cuando el pedido esté `DELIVERED`, el link se convierte en tarjeta permanente del negocio.
8. Migrar estilos a **Tailwind CSS** para mayor velocidad de iteración y mantenimiento.

---

## 5. Recomendación sobre CSS Framework

| Opción | Recomendación | Motivo |
|--------|---------------|--------|
| **Tailwind CSS** | **Recomendado** | Mobile-first, control total, tamaño pequeño en producción, ideal para rediseñar el tiquete |
| Bootstrap 5 | Alternativa válida | Más componentes listos, pero más genérico y pesado |
| CSS vanilla actual | Viable a corto plazo | Ya funciona, pero se vuelve difícil de mantener |

Para producción en Netlify se recomienda usar el CLI de Tailwind (con purge) en lugar del Play CDN.

---

## 6. Arquitectura de datos (Supabase)

Tablas principales:
- `businesses` (configuración por negocio, vertical, plan)
- `orders` (pedidos + estados + saldos)
- `customer_loyalty` + `loyalty_events`
- `payments`
- `coupons` + `reactivation_log`
- `verticals` (emoji y nombre de vertical)

---

## 7. Próximos pasos sugeridos

1. Rediseñar la estructura de `tiquete.html` (QR protagonista + mini-landing).
2. Exponer datos públicos del negocio (servicios, redes, horario).
3. Hacer los medios de pago dinámicos.
4. Evaluar migración a Tailwind CSS para acelerar el desarrollo de UI.
5. Validar con 5-10 negocios reales (lavanderías / zapaterías / parqueaderos) el nuevo flujo.

---

## 8. Enlaces útiles

- Repositorio: https://github.com/contjdiaz/tiquetevivo-maktub
- Demo tiquete: https://resplendent-youtiao-4dd77d.netlify.app/tiquete.html?number=593082&slug=majesty
- Landing: https://resplendent-youtiao-4dd77d.netlify.app/

---

*Documento generado a partir del análisis del código y la arquitectura del prototipo TiqueteVivo.*
