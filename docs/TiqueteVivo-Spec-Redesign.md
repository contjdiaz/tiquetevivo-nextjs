**TiqueteVivo — Spec de Rediseño y Plan de Potenciación**

Resumen ejecutivo
- **Objetivo:** Rediseñar la experiencia pública (clientes y negocios) priorizando claridad, velocidad y conversión. Incluir: reordenar estructura de contenido, sistema visual moderno (Tailwind), QR más visible, mini-landing para negocios, y mejoras recomendadas.
- **Archivo en contexto (prioridad alta):** [docs/TiqueteVivo-Resumen-Funcional-Tecnico.md](docs/TiqueteVivo-Resumen-Funcional-Tecnico.md#L1)

**1. Principios de diseño y estrategia**
- **Conversión primero:** CTA claros, pasos de pedido reducidos a 3, feedback inmediato (toasts/modal).
- **Mobile-first:** mayor foco en pantallas pequeñas; navegación mínima, acciones primarias en zona inferior.
- **Performance:** CSS crítico inline mínimo, imágenes optimizadas, lazy-loading, caché CDN.
- **Accesibilidad:** contraste AA, labels, texto alternativo, foco visible.

**2. Estructura propuesta (reordenada)**
1. Cabecera mínima: logo, botón `Mi pedido` (estado breve), menú hamburguesa.
2. Hero / Mini-landing para el negocio (cuando hay `business view`): nombre, 1 línea valor, QR grande, CTA "Pedir ahora".
3. Servicios / Lista de opciones: tarjetas con precio y tiempo estimado.
4. Proceso de pedido: resumen, fotos (opcional), opciones de pago.
5. Confirmación + instrucciones (pickup/delivery) + WhatsApp quick link.
6. Footer: contacto, políticas, redes.

**3. Visual: sistema y guía**
- **Framework recomendado:** Tailwind CSS (utilidades) — permite prototipado rápido y consistencia.
- **Tokens iniciales (sugeridos en `tailwind.config.js`):**
  - Primario: #0B6E4F (verde marca)
  - Secundario: #F59E0B (accent)
  - Fondo: #FFFFFF / gris claro para superficies
  - Tipografía: Inter (sistema sans fallback)
- **Componentes reutilizables:** Buttons (primary/secondary/ghost), Card producto, QR card, Form inputs, Toasts, Modal.
- **Spacing:** 4/8/12/16 scale; botones grandes en móvil (min-height 44px).

**4. QR: requisitos y especificaciones**
- **Tamaño objetivo en pantalla móvil:** 220–280 px cuadrado visible sin hacer scroll (ideal 26-34% del viewport width).
- **Desktop:** 200–300 px, alto contraste alrededor (panel con sombra) y label "Escanea para pedir".
- **Fallback:** enlace corto visible y botón "Abrir enlace" junto al QR.
- **Accesibilidad:** texto alternativo y declaración de propósito (aria-label).
- **Pruebas:** verificar tasa de reconocimiento con distintas cámaras y luz; añadir meta tag para deep link y esquema URL.

**5. Mini-landing para negocio (detalle de bloques)**
- **Header/Branding:** logo + rating breve.
- **Hero corto:** 1 frase valor + CTA principal y QR grande.
- **Servicios destacados:** 3–6 cards (ícono, nombre, tiempo, precio).
- **Cómo funciona:** 3 pasos visuales (Selecciona → Paga → Entrega/Recoge).
- **Testimonios / trust:** 2–3 reseñas cortas.
- **Contacto rápido:** WhatsApp con plantilla prellenada para soporte.
- **Analytics:** evento `view_mini_landing`, `click_qr`, `start_order`.

**6. Recomendaciones técnicas**
- **Arquitectura front-end:** mantener sitio estático en `public/` y usar Netlify Functions para lógica; compilar assets con un pequeño build (npm script).
- **Integración Tailwind:** usar `npx tailwindcss` para generar `public/styles.css` o incorporar via CDN para MVP (preferible build para producción).
- **Imágenes:** usar WebP/AVIF y `srcset`.
- **PWA (opcional):** agregar manifest y service worker ligero para caching de assets y página de negocio.
- **Seguridad:** no exponer `SUPABASE_SERVICE_ROLE` en el cliente; validar webhooks con `WOMPI_EVENTS_SECRET` (ya presente en repo).

**7. Análisis exhaustivo (resumen técnico)**
- **Código servidor:** Netlify Functions presentes en `netlify/functions/` con flujos de pago y WhatsApp; parece estructurado y modular.
- **Modelo de datos:** `supabase/schema.sql` incluye tablas de `businesses`, `orders`, `payments`, `whatsapp_messages` — diseño relacional suficiente para MVP.
- **Testing:** existe carpeta `tests/` con vitest; buena base para añadir pruebas de integración (webhook signature, idempotency).
- **Riesgos:** integración de pagos y plantillas WhatsApp requieren sandbox y manejo de errores; imágenes subidas deben validar contenidos (size/type).
- **Deuda técnica:** ausencia de CSS modular moderno; `public/*.html` contiene markup estático que requerirá refactor para clases Tailwind y componentes reutilizables.

Veredicto
- Proyecto listo para una iteración de UX y estilo: backend y APIs están en su lugar; mayor trabajo en frontend (build, componentes, accesibilidad) y QA.

**8. Plan de trabajo: fases, tareas y estimaciones**
- Fase 0 — Preparación (0.5d)
  - Revisar `docs/TiqueteVivo-Resumen-Funcional-Tecnico.md` y confirmar alcance (este archivo se ha marcado prioridad alta).
  - Crear branch `feature/redesign-tailwind`.
- Fase 1 — Sistema visual & scaffold (1d)
  - Añadir `package.json` scripts si faltan y dependencias dev: `tailwindcss`, `postcss`, `autoprefixer`.
  - Crear `tailwind.config.js` y `src/styles/tailwind.css`.
  - Generar `public/styles.css` (build step) — script `build:css`.
- Fase 2 — Rediseño y markup (2–3d)
  - Refactor `public/index.html`, `public/tiquete.html`, `public/app.html` a utilidades Tailwind.
  - Implementar componente QR grande y mini-landing en `public/mini-landing.html` (o fragmento insertable).
  - Añadir botón `Pedir ahora` persistente.
- Fase 3 — Integración y assets (1d)
  - Optimizar imágenes, agregar icons SVG inline, configurar lazy-loading.
  - Agregar analytics events (dataLayer o simple fetch events).
- Fase 4 — QA y pruebas (1d)
  - Responsividad (iPhone/Android), contraste (axe), performance (Lighthouse), tests unitarios para funciones críticas.
  - Pruebas de QR en dispositivos reales (o emuladores con camera fallback).
- Fase 5 — Release y monitoreo (0.5d)
  - Desplegar a staging, revisar logs Netlify Functions, monitoreo de errores.

Estimación total: 6–8 días hábiles (equipo 1 dev + 1 QA puede reducir tiempo).

**9. Checklist de entregables**
- Nuevo spec: `docs/TiqueteVivo-Spec-Redesign.md` (este documento).
- Tailwind scaffold (`tailwind.config.js`, `postcss.config.js`, `src/styles/tailwind.css`).
- HTML refactor: `public/*.html` con utilidades Tailwind y `public/mini-landing.html`.
- Scripts: `package.json` con `build:css` y `build`.
- QA report: Lighthouse + accesibilidad + pruebas QR.

**10. Métricas de éxito**
- Aumento de conversiones (CTA->checkout) en +15% en 30 días.
- Reducción de TTFB/CSS blocking y mejora de Lighthouse Performance +10 pts.
- Mejora en tasa de reconocimiento de QR +25% (medido por click-through `click_qr`).

Siguientes pasos recomendados (elige una):
- A) Inicio inmediato: implemento scaffold Tailwind + `build:css` y creo `public/mini-landing.html` (puedo hacerlo ahora).
- B) Documentación primero: extiendo este spec con wireframes y ejemplos de marcado antes de tocar código.

Por favor indícame la opción que prefieres para que ejecute la próxima acción.
