# Plan de Mejora de Diseño UX/UI: TiqueteVivo (Multi-Vertical)

Como Senior UX Designer, he analizado la interfaz actual de TiqueteVivo. Tras confirmar que **la primera fase de este plan (reemplazo a paleta Slate, tokens semánticos y refactorización de colores hardcodeados de WhatsApp) ya se encuentra implementada en `globals.css` y `page.tsx`**, he expandido este plan para asegurar que el sistema de diseño soporte de manera nativa la naturaleza **multi-vertical** de la plataforma (Lavanderías, Talleres, Pastelerías, Mascotas, Domicilios, etc.).

## 1. Evaluación Visual Actual (Post-Fase 1)

### ¿Qué funciona y qué se ha mejorado?
* **Transición a Neutros Fríos (Slate):** El reemplazo de los tonos terrosos (`stone`) por grises azulados (`slate`) ha elevado inmediatamente la percepción de limpieza, profesionalismo y tecnología.
* **Tokens Semánticos:** La reciente inclusión de colores semánticos (`success`, `warning`, `error`, `info`) en `globals.css` proporciona una excelente base para normalizar el feedback visual.
* **Variables Autocontenidas:** El widget de WhatsApp ahora usa variables nativas (`--color-whatsapp-*`), lo que lo blinda ante cambios de temas visuales.
* **Tipografía clara:** El uso de `Inter` y la jerarquía de `.font-display` continúan aportando solidez.

### Oportunidades restantes (Fricciones)
* **Tematización Rígida (Single-Brand):** Actualmente el proyecto usa una única paleta estática `--color-brand-*`. Dado que la plataforma soporta 12 verticales parametrizadas (cada una con su propio color en BD, ej: Taller usa naranja, Pastelería rosa, Domicilios lima), la UI no se adapta dinámicamente a la identidad visual de cada negocio.
* **Badges y Estados Rígidos:** Los estados de los pedidos varían por vertical (ej. "En preparación" vs "Lavando"), pero el panel aún puede mejorar la forma en que auto-asigna colores semánticos basándose en el tipo de estado.
* **Consistencia en Componentes:** Existen más de 1600 líneas en `app/panel/page.tsx` donde se combinan lógicas y estilos (formularios, modales, tablas), dificultando la aplicación del nuevo sistema visual de manera uniforme.

## 2. Propuesta Multi-Vertical: Tematización Dinámica

El objetivo es que **la interfaz herede automáticamente el color y la iconografía (emoji) definidos para el negocio/vertical en la base de datos** (`businesses.color`), manteniendo la estructura neutral intacta.

* **El concepto del "Color Semilla":**
  * TiqueteVivo debe migrar de usar `--color-brand-500` estático a una variable CSS dinámica (ej: `--theme-primary`) que se inyecte vía React en el layout o contenedor principal (`<div style={{ '--theme-primary': config.color }}>`).
* **Soporte de las Verticales Actuales (Ejemplos):**
  * 🧺 *Lavandería:* Verde agua/Teal (frescura).
  * 🔧 *Taller (Mechanic):* Naranja (energía y herramientas).
  * 🍰 *Pastelería (Bakery):* Rosa/Magenta (dulzura).
  * 🛵 *Domicilios (Delivery):* Lima/Verde brillante (rapidez).
  * 📦 *Mensajería (Courier):* Cyan/Azul oscuro (seguridad).
* **Superficies Neutras (Slate):** Los fondos, tarjetas y bordes permanecerán en tonos Slate para garantizar que cualquier "Color Semilla" resalte correctamente sin generar choques cromáticos.

## 3. Mejoras de Diseño Priorizadas (Enfoque Multi-Vertical)

### Mejora 1: Implementación de Temas Dinámicos (Impacto: Muy Alto)
* **Problema:** Un taller mecánico (Naranja) o una floristería (Verde) visualizan el panel y la página del tiquete con el color base predeterminado, generando disonancia de marca frente a sus clientes.
* **Solución:** Utilizar el `color` definido en la configuración del negocio (inyectado desde Supabase) y pasarlo a través de variables CSS personalizadas. Con Tailwind v4, se puede usar `color-mix()` para derivar automáticamente toda la paleta (50 a 900) a partir de un solo color hexadecimal proporcionado por el usuario.

### Mejora 2: Sistema Inteligente de "Status Badges" (Impacto: Alto)
* **Problema:** Cada vertical tiene su propio flujo de estados (ej: `ORDERED` -> `IN_PREPARATION` -> `ON_THE_WAY` -> `DELIVERED`). El frontend necesita saber qué color aplicar a cada uno dinámicamente.
* **Solución:** Optimizar el componente `Badge` que ya mapea estados, asegurando reglas generales:
  * Estados iniciales (ej. Received) = `info` (Azul)
  * Estados intermedios (ej. In Progress) = `warning` (Ámbar)
  * Estados listos/exitosos (ej. Ready, Delivered) = `success` (Verde)
  * Cancelaciones = `error` (Rojo)

### Mejora 3: Adaptabilidad de los Formularios (Custom Fields) (Impacto: Medio-Alto)
* **Problema:** Las verticales tienen campos personalizados muy variados (ej: "Placa del vehículo" vs "Sabor de torta"). La vista del tiquete público (`app/tiquete/[id]/page.tsx`) puede verse desordenada.
* **Solución:** Diseñar un layout de cuadrícula (grid) estandarizado para mostrar los `custom_fields`. Usar íconos sutiles o tipografía en color `slate-500` para diferenciar la metadata del negocio respecto a los cobros, dándole flexibilidad a cualquier tipo de dato (fechas, booleanos, selectores).

### Mejora 4: Refactorización a Componentes UI Reutilizables (Impacto: Alto)
* **Problema:** El panel central es un monolito de UI y lógica.
* **Solución:** Extraer botones (`Button`), insignias (`Badge`), tarjetas (`Card`) y campos de texto a una estructura estandarizada (ej. `components/ui`). Esto asegurará que al aplicar el "Color Semilla", los botones primarios y los anillos de foco (`focus:ring`) cambien de manera global en todos los modales y vistas.

### Mejora 5: Accesibilidad y Jerarquía del Saldo (Impacto: Medio)
* **Problema:** El valor más crítico en el tiquete (para cualquier vertical) es el **"Saldo Pendiente"**.
* **Solución:** Diseñar un bloque visual (Banner) específico para el saldo. Si es $0, debe ser estilizado con los tokens de `success`. Si es mayor a $0, debe ser `warning`. Esto estandariza la lectura de cuentas por cobrar.

## 4. Plan de Implementación Actualizado

**Fase 1: Confirmada y Completada** ✅
* Migración a paleta neutral (Slate) completada en `globals.css` y `page.tsx`.
* Definición de semánticos e inyección de tokens de WhatsApp completada.

**Fase 2: Theming Dinámico Multi-Vertical (Completada)** ✅
* Modificación completada a través del hook `useBrandTheme` (`lib/brand-theme.ts`) que inyecta `business.color` como `--theme-primary` resolviendo contrastes automáticamente.
* Paleta `--color-brand-*` generada exitosamente en `globals.css` usando `color-mix()`.

**Fase 3: Componentización de la UI (Completada)** ✅
* Extracción lograda de componentes UI aislados (`Button`, `StatusTag`).
* Refactorización del renderizado de estados (`status_flow_config`) mapeados inteligentemente a colores semánticos a través de `statusToTone`.

**Fase 4: Optimización Móvil y Accesibilidad (Próximo Paso)** 🚧
* Pruebas de contraste de color con las 12 paletas parametrizadas en monitores físicos y bajo luz solar (móviles).
* Refinamiento de la vista pública del tiquete para garantizar accesibilidad total de los *Custom Fields*.

## 5. Especificaciones de Diseño para Theming Dinámico (Tailwind v4)

Para habilitar la paleta multi-vertical de TiqueteVivo sin tener que generar múltiples paletas estáticas, recomiendo actualizar `globals.css` reemplazando los actuales `--color-brand-*` (hardcodeados) por este patrón dinámico:

```css
@theme {
  /* Se inyecta vía React (ej: style={{ '--theme-primary': business.color || '#289a71' }}) */
  --color-brand-base: var(--theme-primary, #289a71);
  
  /* Variantes generadas usando color-mix (Soportado en navegadores modernos y Tailwind v4) */
  --color-brand-50: color-mix(in srgb, var(--color-brand-base) 10%, transparent);
  --color-brand-100: color-mix(in srgb, var(--color-brand-base) 20%, transparent);
  --color-brand-500: var(--color-brand-base);
  --color-brand-600: color-mix(in srgb, var(--color-brand-base) 80%, black);
  --color-brand-700: color-mix(in srgb, var(--color-brand-base) 60%, black);
  --color-brand-900: color-mix(in srgb, var(--color-brand-base) 40%, black);
}
```
Esto permitirá que todos los estilos de Tailwind como `bg-brand-500` o `text-brand-600` se ajusten dinámicamente: Naranja para mecánicos, Rosa para pastelerías, Azul para mensajería, todo desde el mismo código.
