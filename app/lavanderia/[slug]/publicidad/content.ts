/**
 * Contenido estático de presentación para la Landing_Dueño del vertical
 * lavanderia (`/lavanderia/[slug]/publicidad`).
 *
 * Todo lo definido aquí es contenido 100% estático y explicativo: describe el
 * flujo del vertical lavanderia y las funcionalidades del Panel_Dueño y el
 * Puente_Cotización_Pedido. NO consulta ni expone datos operativos privados,
 * no hace fetch y no depende del estado del negocio (R4.3, R5, R6, R7).
 *
 * Las constantes se consumen desde `page.tsx` para renderizar la
 * Sección_Cómo_Funciona y la Sección_Funcionalidades.
 */

/**
 * Modelo de presentación para un paso secuencial de la Sección_Cómo_Funciona.
 * No refleja datos del negocio (R4.3).
 */
export interface PasoComoFunciona {
  /** Título corto del paso (p. ej. "1. Publicación de servicios"). */
  titulo: string;
  /** Descripción explicativa estática del paso. */
  descripcion: string;
}

/**
 * Modelo de presentación para una tarjeta de la Sección_Funcionalidades.
 * No refleja datos del negocio (R4.3).
 */
export interface TarjetaFuncionalidad {
  /** Título de la funcionalidad. */
  titulo: string;
  /** Descripción explicativa estática de la funcionalidad. */
  descripcion: string;
}

/**
 * Pasos secuenciales del flujo de extremo a extremo del vertical lavanderia
 * (R4.2): publicación de servicios → cotización del cliente → gestión de la
 * cotización → pedido con tiquete.
 */
export const PASOS_COMO_FUNCIONA: readonly PasoComoFunciona[] = [
  {
    titulo: "1. Publicación de servicios",
    descripcion:
      "El negocio publica sus servicios con precio por kilo, por prenda, por " +
      "hora o tarifa fija. Quedan disponibles en una página pública con la " +
      "marca del negocio, lista para compartir por WhatsApp o redes."
  },
  {
    titulo: "2. Cotización del cliente",
    descripcion:
      "El cliente explora los servicios, busca entre ellos y arma su pedido. " +
      "La página calcula un total estimado en tiempo real y mantiene un " +
      "resumen persistente mientras elige."
  },
  {
    titulo: "3. Gestión de la cotización",
    descripcion:
      "El dueño recibe la cotización en su panel, la revisa y confirma el valor " +
      "según el peso real de la ropa y las prendas recibidas antes de " +
      "convertirla en pedido."
  },
  {
    titulo: "4. Pedido con tiquete",
    descripcion:
      "La cotización se convierte en un único pedido con tiquete público. Cada " +
      "pedido incluye un QR de seguimiento y un link de entrega para " +
      "acompañar al cliente hasta que recibe su ropa limpia."
  }
] as const;

/**
 * Tarjetas de funcionalidades del Panel_Dueño y el Puente_Cotización_Pedido
 * (R5, R6, R7). Contenido puramente textual: no invoca `order-bridge.ts` ni
 * consulta pedidos.
 */
export const TARJETAS_FUNCIONALIDAD: readonly TarjetaFuncionalidad[] = [
  {
    // R5.1, R5.2, R5.3
    titulo: "Página pública de servicios y cotización",
    descripcion:
      "Una página pública con la marca del negocio donde el cliente busca " +
      "servicios, ve el total estimado, conserva un resumen persistente y " +
      "encuentra estados vacíos claros cuando no hay resultados. El total es " +
      "estimado: lo confirma el negocio según el peso real y las prendas " +
      "recibidas. Además, esta landing es una página de publicidad compartible " +
      "para difundir el negocio en redes y mensajería."
  },
  {
    // R6.1 — variante servicios para lavanderia
    titulo: "Gestión de servicios",
    descripcion:
      "Crea, edita y desactiva servicios desde el panel. Define la unidad de " +
      "cobro (por kilo, por prenda, por hora o tarifa fija), el tiempo estimado " +
      "y el precio, manteniendo la oferta siempre actualizada."
  },
  {
    // R6.2
    titulo: "Gestión de promociones",
    descripcion:
      "Publica banners y códigos de descuento con vigencia y porcentaje " +
      "configurables para impulsar tus servicios en fechas especiales."
  },
  {
    // R6.3
    titulo: "Gestión de cotizaciones",
    descripcion:
      "Lista las cotizaciones recibidas, márcalas como convertidas y conviértelas " +
      "en pedido con un par de clics, sin perder de vista ninguna oportunidad."
  },
  {
    // R6.4
    titulo: "Analítica",
    descripcion:
      "Consulta cotizaciones por semana, porcentaje de conversión, recompra y el " +
      "promedio del total estimado para entender cómo evoluciona tu negocio."
  },
  {
    // R7.1, R7.2, R7.3
    titulo: "Puente cotización → pedido → tiquete",
    descripcion:
      "Convierte una cotización en un pedido con tiquete público. Cada pedido " +
      "incluye un QR de seguimiento y un link de entrega, y una cotización " +
      "produce un único pedido para evitar duplicados."
  }
] as const;