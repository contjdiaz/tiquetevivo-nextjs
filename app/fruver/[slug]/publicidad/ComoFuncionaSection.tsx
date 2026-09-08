import { PASOS_COMO_FUNCIONA } from "./content";

/**
 * Sección_Cómo_Funciona — bloque explicativo estático con encabezado propio
 * (R4.1) que describe de forma secuencial el flujo de extremo a extremo del
 * vertical fruver (R4.2): publicación del catálogo → cotización del comprador →
 * gestión de la cotización → pedido con tiquete.
 *
 * El contenido proviene íntegramente de la constante estática
 * `PASOS_COMO_FUNCIONA` (definida en `./content`): no hace fetch ni expone datos
 * operativos privados del Panel_Dueño (R4.3). Es un componente presentacional
 * sin estado de cliente, seguro dentro de un Server Component.
 *
 * Accesibilidad transversal (R10): usa una lista ordenada con encabezados
 * semánticos por paso, texto sobre superficies con Contraste_AA y no incorpora
 * imágenes ni controles interactivos que requieran etiqueta adicional.
 */
export default function ComoFuncionaSection() {
  return (
    <section aria-labelledby="como-funciona-titulo" className="mt-8">
      <h2
        id="como-funciona-titulo"
        className="text-lg font-extrabold text-slate-800"
      >
        Cómo funciona
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Del catálogo al pedido con tiquete, en cuatro pasos claros para el
        comprador y para ti.
      </p>

      <ol className="mt-4 space-y-3">
        {PASOS_COMO_FUNCIONA.map((paso) => (
          <li
            key={paso.titulo}
            className="rounded-3xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
          >
            <h3 className="text-sm font-extrabold text-slate-800">
              {paso.titulo}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {paso.descripcion}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
