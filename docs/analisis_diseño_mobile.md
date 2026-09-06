# Plan de Análisis y Mejora de Diseño UX/UI (Vista Móvil)

Al analizar la interfaz actual con enfoque en **Responsive Design** y el uso en dispositivos móviles (tanto para el cliente como para el operador del negocio), destaco que la plataforma ya cuenta con patrones de diseño avanzados muy similares a los de una aplicación nativa. Sin embargo, existen oportunidades puntuales para evitar problemas en pantallas muy reducidas (ej. iPhone SE o teléfonos gama baja de 320px - 360px de ancho).

## 1. Puntos Fuertes (Mobile UX)

### Panel de Administración (`app/panel/page.tsx`)
* **Navegación Inferior (Bottom Tab Bar):** La implementación de la barra `<nav className="fixed inset-x-0 bottom-0 ... lg:hidden">` es excelente. Traslada las acciones clave (Pedidos, Escanear, Actualizar, Caja) a la "Thumb Zone" (zona del pulgar), emulando una PWA (Progressive Web App) perfectamente.
* **Bottom Sheets para Formularios:** El formulario de "Nuevo Tiquete" no es un modal central intrusivo, sino que emerge desde abajo (`items-end`, `h-[92vh]`, `rounded-t-2xl`). Este es un patrón de diseño móvil premium que facilita la captura de datos con el teclado en pantalla.
* **Espaciado y Touch Targets:** Los botones y campos de texto mantienen un tamaño adecuado (generalmente `py-2` o `py-3`), cumpliendo con el mínimo de 44x44px recomendado por Apple/Google para áreas táctiles.

### Vista Pública del Tiquete (`app/tiquete/page.tsx`)
* **Jerarquía de Tarjetas (Stacking):** El uso de `grid-cols-1 lg:grid-cols-2` asegura que el resumen del tiquete aparezca primero, seguido por el bloque del Código QR. La lectura vertical tiene total sentido en móvil.
* **Botones de Acción Completa (Full-width):** El botón de pago (`PaymentButton`) utiliza `w-full`, lo que lo hace prominente y fácil de tocar.

---

## 2. Puntos Débiles y Oportunidades de Mejora

### Mejora 1: El Stepper de Estados (Tiquete Público)
* **Problema:** En `app/tiquete/page.tsx`, el indicador visual de progreso (Stepper) renderiza los 4 estados de forma horizontal (`flex-1`). Los textos de cada paso tienen un `max-w-[110px]`. En pantallas de 320px de ancho, 4 pasos intentarán ocupar ~440px, lo que causará que los textos se traslapen, se rompan incómodamente en múltiples líneas, o deformen la tarjeta.
* **Solución:** 
  * *Opción A:* En resoluciones móviles (`< sm`), cambiar el Stepper a formato vertical.
  * *Opción B:* Ocultar los textos de los pasos inactivos en móvil y mostrar solo el texto del paso actual.
  * *Opción C:* Permitir desplazamiento horizontal (Scroll Snap) agregando `overflow-x-auto snap-x` al contenedor del Stepper.

### Mejora 2: Filtros de Búsqueda (Panel)
* **Problema:** En el panel de control, los controles de búsqueda, el selector de estado (`<select>`) y el conmutador de vista (Lista/Tablero) utilizan `flex-wrap`. En móviles, esto puede resultar en que el campo de búsqueda quede aplastado (muy angosto) si comparte fila con los demás botones.
* **Solución:** Hacer que en móvil (`< md`) el input de búsqueda ocupe el 100% del ancho (`w-full`), empujando los selectores a una segunda fila de controles.

### Mejora 3: Vista de Kanban en Móvil (Panel)
* **Problema:** El "Tablero" (Kanban) es ideal para pantallas grandes (iPad/Desktop). En teléfonos, las columnas horizontales obligan a hacer scroll lateral y el "Drag and Drop" a menudo interfiere con el scroll nativo de la pantalla, causando frustración.
* **Solución:** Forzar que la vista móvil por defecto sea siempre "Lista" (`view === "table"`) y, si el usuario explícitamente activa "Tablero", asegurar que la columna activa ocupe el 90% del ancho de la pantalla (`w-[90vw]`) para facilitar el scroll tipo carrusel (snap).

### Mejora 4: Interacciones Modales de Escáner
* **Problema:** El modal del Escáner QR en `app/panel/page.tsx` está centrado (`items-center`). En dispositivos móviles, el teclado virtual puede superponerse al campo de "ingreso manual", empujando el modal fuera de vista.
* **Solución:** Al igual que el formulario de Nuevo Tiquete, el modal de Escáner debería adherirse a la parte superior (`items-start`) o inferior (`items-end` bottom sheet) en dispositivos móviles para que interactúe amigablemente con el teclado.

---

## 3. Especificaciones de Implementación Sugeridas (Tailwind)

**Para el Stepper (Solución de Scroll Horizontal):**
```jsx
// En app/tiquete/page.tsx
<div className="relative flex items-start justify-between overflow-x-auto pb-4 snap-x hide-scrollbar">
  {flow.map((step, i) => (
    <div key={i} className="flex min-w-[90px] flex-1 flex-col items-center snap-center">
      {/* Círculo e Ícono */}
      <span className="text-xs text-center">{step.label}</span>
    </div>
  ))}
</div>
```

**Para los Filtros del Panel:**
```jsx
// En app/panel/page.tsx
<div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
  <input className="w-full md:w-56 md:flex-1" placeholder="🔍 Buscar..." />
  <div className="flex w-full gap-2 md:w-auto">
    <select className="flex-1 md:w-auto">...</select>
    <div className="flex-none">...botones de vista...</div>
  </div>
</div>
```

Con estas correcciones puntuales, TiqueteVivo ofrecerá una experiencia **World-Class** en dispositivos móviles, previniendo los errores más comunes de Responsive Design en aplicaciones SaaS.
