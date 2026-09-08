/**
 * Contenido estático de presentación para la Landing_Dueño
 * (`/fruver/[slug]/publicidad`).
 *
 * Todo lo definido aquí es contenido 100% estático y explicativo: describe el
 * flujo del vertical fruver y las funcionalidades del Panel_Dueño y el
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
  /** Título corto del paso (p. ej. "1. Publicación del catálogo"). */
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
 * Pasos secuenciales del flujo de extremo a extremo del vertical fruver (R4.2):
 * publicación del catálogo → cotización del comprador → gestión de la cotización
 * → pedido con tiquete.
 */
export const PASOS_COMO_FUNCIONA: readonly PasoComoFunciona[] = [
  {
    titulo: "1. Publicación del catálogo",
    descripcion:
      "El negocio publica su catálogo del día con fotos, precios y unidades. " +
      "Queda disponible en una página pública con la marca del negocio, lista " +
      "para compartir por WhatsApp o redes."
  },
  {
    titulo: "2. Cotización del comprador",
    descripcion:
      "El comprador explora el catálogo, busca productos y arma su pedido. La " +
      "página calcula un total estimado en tiempo real y mantiene un resumen " +
      "persistente mientras elige."
  },
  {
    titulo: "3. Gestión de la cotización",
    descripcion:
      "El dueño recibe la cotización en su panel, la revisa y confirma el total " +
      "estimado según la disponibilidad real y el peso final de cada producto " +
      "antes de convertirla en pedido."
  },
  {
    titulo: "4. Pedido con tiquete",
    descripcion:
      "La cotización se convierte en un único pedido con tiquete público. Cada " +
      "pedido incluye un QR de seguimiento y un link de entrega a domicilio para " +
      "acompañar al comprador hasta que recibe su compra."
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
    titulo: "Página pública de catálogo y cotización",
    descripcion:
      "Una página pública con la marca del negocio donde el comprador busca " +
      "productos, ve el total estimado, conserva un resumen persistente y " +
      "encuentra estados vacíos claros cuando no hay resultados. El total es " +
      "estimado: lo confirma el negocio según la disponibilidad y el peso real. " +
      "Además, esta landing es una página de publicidad compartible para difundir " +
      "el negocio en redes y mensajería."
  },
  {
    // R6.1
    titulo: "Gestión de catálogo",
    descripcion:
      "Crea, edita y desactiva productos con foto desde el panel. Mantén el " +
      "catálogo del día siempre actualizado según lo que tengas disponible."
  },
  {
    // R6.2
    titulo: "Gestión de promociones",
    descripcion:
      "Publica banners, combos y códigos de descuento con vigencia y porcentaje " +
      "configurables para impulsar la venta de tus productos de temporada."
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
      "incluye un QR de seguimiento y un link de entrega a domicilio, y una " +
      "cotización produce un único pedido para evitar duplicados."
  }
] as const;
