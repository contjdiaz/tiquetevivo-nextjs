import { TARJETAS_FUNCIONALIDAD } from "./content";

/**
 * Sección_Funcionalidades — bloque explicativo estático con encabezado propio
 * que agrupa las descripciones de gestión del Panel_Dueño y el
 * Puente_Cotización_Pedido (R5, R6, R7).
 *
 * Cada subbloque es una tarjeta de presentación con título y texto explicativo
 * estático a partir de la constante `TARJETAS_FUNCIONALIDAD` (definida en
 * `./content`): página pública de catálogo y cotización (con total estimado y
 * landing compartible), gestión de catálogo, promociones, cotizaciones,
 * analítica y el puente cotización → pedido → tiquete (con QR + link de entrega
 * y único pedido por cotización).
 *
 * El contenido es puramente textual: no hace fetch, no invoca
 * `order-bridge.ts` ni consulta pedidos, y no expone datos operativos privados
 * del Panel_Dueño. Es un componente presentacional sin estado de cliente,
 * seguro dentro de un Server Component.
 *
 * Accesibilidad transversal (R10): usa una lista con encabezados semánticos por
 * tarjeta, texto sobre superficies con Contraste_AA y no incorpora imágenes ni
 * controles interactivos que requieran etiqueta adicional.
 */
export default function FuncionalidadesSection() {
  return (
    <section aria-labelledby="funcionalidades-titulo" className="mt-8">
      <h2
        id="funcionalidades-titulo"
        className="text-lg font-extrabold text-slate-800"
      >
        Todo lo que puedes gestionar
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Desde la página pública de tu catálogo hasta el pedido con tiquete, estas
        son las funcionalidades que la plataforma pone a tu disposición.
      </p>

      <ul className="mt-4 space-y-3">
        {TARJETAS_FUNCIONALIDAD.map((tarjeta) => (
          <li
            key={tarjeta.titulo}
            className="rounded-3xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
          >
            <h3 className="text-sm font-extrabold text-slate-800">
              {tarjeta.titulo}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {tarjeta.descripcion}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
