# Análisis Exhaustivo y Plan de Mejoras — TiqueteVivo

**Fecha:** 24 Agosto 2026  
**Rama actual:** `ft/single-business-view` (52 archivos modificados, +4,874 líneas vs main)  
**Estado:** 352 tests pasando, 4 specs implementados, servidor funcional local

---

## 1. Estado Actual vs Main

### Funcionalidades implementadas en esta rama (no están en main):

| Feature | Estado | Archivos nuevos/modificados |
|---------|--------|---------------------------|
| Vista single-business (lavandería enfocada) | ✅ | app.html, app.js |
| Formulario dinámico por servicio | ✅ | app.html, app.js |
| Freemium (plan free/paid) | ✅ | schema, create-order, update-order |
| Roles y autenticación (Supabase Auth) | ✅ | _utils.js, auth-login.js, business_users |
| Plataforma multi-vertical (12 verticales) | ✅ | _vertical-config.js, migraciones, seed data |
| QR dinámico multi-modo | ✅ | qr-payload.js, qr-renderer.js, qr-mode-selector.js |
| WhatsApp auto-send con template engine | ✅ | _template-engine.js, _whatsapp.js |
| Tarjeta de fidelidad digital | ✅ | _loyalty.js, loyalty-widget.js |
| Conciliación automática de pagos (Wompi/Bold) | ✅ | _payments.js, payments-webhook.js |
| Recordatorios de reactivación (cron) | ✅ | cron-reactivation.js, validate-coupon.js |
| Evidencia fotográfica y confirmación digital | ✅ | create-order.js, update-order.js |
| Kanban board drag & drop | ✅ | kanban-board.js |

---

## 2. Bugs Encontrados y Corregidos

| Bug | Causa Raíz | Fix Aplicado |
|-----|-----------|-------------|
| Tiquete muestra pedido equivocado | `list[0]` fallback cuando no encuentra order_number + frontend no enviaba orderNumber al backend | Frontend genera y envía orderNumber; removido fallback `list[0]` |
| QR no se renderiza | Service Worker cachea POST requests (Kaspersky + CDN) → TypeError rompe cadena de promesas | Agregado `if (method !== 'GET') return;` al SW; librería QR local |
| RLS recursión en business_users | Policy usa `auth.uid()` que trigger otra policy → loop infinito | Función `is_superadmin()` con SECURITY DEFINER |
| Trigger no existe en migración | `update_updated_at_column()` aún no creada cuando la migración 008 la referencia | Migración 008 self-contained |

---

## 3. Bugs Pendientes / Problemas Conocidos

### 🔴 Críticos

| # | Problema | Impacto | Solución Propuesta |
|---|---------|---------|-------------------|
| 1 | `list-orders.js` es público (sin auth) | Cualquiera con el slug puede ver todos los pedidos y datos de clientes | Requerir auth o al mínimo un token de lectura por negocio |
| 2 | `manage-business.js` no valida autenticación | Cualquiera puede registrar negocios, cambiar configs de fidelidad/reactivación | Agregar `requireAuth()` con permiso `manage_business` |
| 3 | Fotos almacenadas como base64 en la tabla `orders` | Un pedido con foto puede pesar 2-5MB en la DB; no escala | Migrar a Supabase Storage y guardar solo URL |
| 4 | Checkout de Wompi retorna 403 desde localhost | `redirect-url` en `http://localhost` no es aceptado por Wompi | Requiere deploy a Netlify o túnel HTTPS (ngrok/cloudflared) |

### 🟡 Importantes

| # | Problema | Impacto | Solución Propuesta |
|---|---------|---------|-------------------|
| 5 | Datos de pago hardcodeados en QR (`NEQUI:3102688991`) | Todos los negocios muestran el mismo número Nequi | Leer `payment_account` de la config del negocio |
| 6 | N+1 queries en loyalty por teléfono | Con 50 clientes únicos = 50 queries secuenciales a Supabase | Batch query con `IN` clause |
| 7 | Sin paginación en `list-orders` | Solo `limit`, sin offset/cursor → problemas con >100 pedidos | Implementar paginación cursor-based |
| 8 | Service Worker cachea versiones viejas de archivos | El usuario necesita des-registrar el SW manualmente | Implementar versionamiento con hash en URLs de assets |
| 9 | `app.js` es monolito (~1500 líneas) | Difícil de mantener, un cambio puede romper todo | Dividir en módulos ES (como ya se hizo con qr-payload.js, loyalty-widget.js) |
| 10 | CSS inline en `app.html` (~800 líneas) | No cacheable separadamente, aumenta tamaño del HTML | Extraer a `app.css` externo |

### 🟢 Menores

| # | Problema | Impacto | Solución Propuesta |
|---|---------|---------|-------------------|
| 11 | `.netlify/` en el repo | Archivos de build local ensuciando el repo | Agregar a `.gitignore` |
| 12 | CRLF inconsistente entre archivos | Warnings en git diff | Configurar `.editorconfig` y `git config core.autocrlf` |
| 13 | Tests de propiedad opcionales (~20) no implementados | Menor cobertura en edge cases | Implementar en batch cuando sea prioridad |
| 14 | Credenciales de admin en `.env.example` | Exposición de password default en repo público | Cambiar a placeholder: `ADMIN_PASSWORD=CHANGE_ME` |

---

## 4. Deuda Técnica

### Arquitectura Frontend

| Aspecto | Estado Actual | Estado Ideal |
|---------|--------------|-------------|
| `app.js` | Monolito IIFE ~1500 líneas | Módulos ES separados: `order-form.js`, `order-table.js`, `sync.js`, `whatsapp-messages.js`, `cash-report.js` |
| `app.html` | CSS + HTML + JS inline (1600+ líneas) | HTML semántico + CSS externo + módulos JS |
| Build | Sin build step | Bundler mínimo (esbuild) para minificar/cachear |
| Carga | Todo se carga de golpe | Lazy loading por módulo/vista |

### Backend

| Aspecto | Estado Actual | Estado Ideal |
|---------|--------------|-------------|
| Autenticación | Implementada pero inconsistente (algunos endpoints no la usan) | Todos los endpoints de escritura protegidos |
| Fotos | Base64 en columna text | Supabase Storage + URL en columna |
| Pagos | Integración completa pero sin testing E2E real | Probar flujo completo con deploy + Wompi sandbox |
| Reactivación | Cron implementado pero no testeable localmente | Agregar endpoint manual `/api/trigger-reactivation` para testing |

---

## 5. Mejoras Recomendadas (Priorizadas)

### Prioridad 1 — Seguridad (antes de deploy a producción)

1. **Proteger `list-orders`** para que requiera auth o al mínimo un bearer token del negocio
2. **Proteger `manage-business.js`** con `requireAuth()`
3. **Migrar fotos a Supabase Storage** (las base64 no escalan)
4. **Cambiar password default** en `.env.example`
5. **Rate limiting** en endpoints públicos (payments-webhook, validate-coupon)

### Prioridad 2 — Estabilidad y UX

6. **Parametrizar datos de pago** en el QR (leer de business config, no hardcodear)
7. **Refactorizar `app.js`** en módulos ES separados
8. **Extraer CSS** de `app.html` a archivo externo
9. **Mejorar Service Worker** con versionamiento por hash y actualización forzada
10. **Agregar loading states** (spinners) en el panel de operador

### Prioridad 3 — Performance y Escalabilidad

11. **Optimizar loyalty queries** — Batch con IN clause en vez de loop N+1
12. **Paginación** en `list-orders` con cursor-based pagination
13. **Lazy loading** de módulos JS no críticos (kanban, scanner, coupon)
14. **Cache-Control headers** en netlify.toml para assets estáticos

### Prioridad 4 — Features Pendientes

15. **Alertas de pedidos abandonados** — Cron que detecta pedidos en estado "Listo" por >3 días y envía recordatorio
16. **Checklist de prendas completo** — UI de garment checklist en app.html usando la tabla `order_items`
17. **Dashboard de métricas** — Gráficas de retención, stamps/rewards, pagos recibidos
18. **Integración directa Nequi** — API Push de Nequi para pagos sin intermediario (requiere Nequi Conecta)
19. **Multi-idioma** — Soporte para inglés (para negocios en zonas turísticas)

### Prioridad 5 — DevOps y Infraestructura

20. **CI/CD pipeline** — GitHub Actions con: lint → test → deploy preview en Netlify
21. **Monitoring** — Integrar Sentry o similar para error tracking en producción
22. **Agregar `.netlify/`** a `.gitignore`
23. **Configurar `.editorconfig`** para consistencia de formato
24. **Staging environment** — Deploy separado para QA antes de producción

---

## 6. Plan de Refactorización de `app.js`

Propuesta de división en módulos (sin romper funcionalidad):

```
public/js/
├── app-core.js          → Estado global, normalize(), variables, init
├── app-sync.js          → sync(), createOrder(), authFetch()
├── app-render.js        → render(), table HTML, mobile cards
├── app-form.js          → Form submit, custom fields, service calculator
├── app-whatsapp.js      → buildWaLink(), buildWhatsAppMessage(), templates
├── app-qr-modal.js      → openQrModal(), generateQR(), receipt box
├── app-kanban.js        → (ya existe: kanban-board.js)
├── app-cash-report.js   → Cierre de caja
├── app-loyalty.js       → Loyalty badges, coupon redemption UI
└── app-status.js        → Status filter, status labels, status flow
```

**Estrategia de migración:**
1. Extraer funciones puras primero (buildWaLink, templates, normalize)
2. Crear un namespace global `window.TiqueteApp` como bridge durante transición
3. Migrar una sección a la vez con tests de regresión
4. Al final eliminar `app.js` monolítico

---

## 7. Checklist Pre-Deploy a Producción

- [ ] Proteger endpoints sin auth (`list-orders`, `manage-business`, `get-business-config`)
- [ ] Migrar fotos base64 a Supabase Storage
- [ ] Cambiar password default en `.env.example`
- [ ] Configurar variables de entorno en Netlify dashboard
- [ ] Registrar webhook URL de Wompi con dominio de producción
- [ ] Aprobar templates de WhatsApp en Meta Business (reactivación)
- [ ] Ejecutar migraciones en Supabase producción (011-013)
- [ ] Verificar que cron-reactivation se activa post-deploy
- [ ] Agregar `.netlify/` a `.gitignore`
- [ ] Probar flujo completo E2E: crear pedido → entregar → sello → pagar → reactivar
- [ ] Parametrizar datos de pago en QR desde business config
- [ ] Actualizar README con instrucciones de deploy definitivas

---

## 8. Métricas Actuales del Proyecto

| Métrica | Valor |
|---------|-------|
| Funciones Netlify | 32 archivos (21 endpoints + 8 módulos compartidos + 3 admin) |
| Archivos frontend | 6 páginas HTML + 12 módulos JS |
| Tests | 352 tests en 30 archivos (100% passing) |
| Migraciones DB | 14 archivos SQL |
| Líneas de código (estimado) | ~12,000 (backend + frontend + tests) |
| Verticales soportadas | 12 (lavandería, parqueadero, zapatería, etc.) |
| Features de retención | 3 (fidelidad, pagos, reactivación) |
