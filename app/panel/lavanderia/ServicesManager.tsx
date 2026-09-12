"use client";

/**
 * ServicesManager — Panel del Dueño de la vertical lavanderia: gestión de
 * servicios (R6.1 sobre `businesses.services_config`).
 *
 * CRUD sobre los servicios de la lavandería reutilizando el endpoint existente
 * `manage-business` (acciones `add-service` / `update-service` /
 * `disable-service`, autorizadas con `manage_business` y aisladas por
 * `business_id`). La lista se refresca desde `get-business-config`, la misma
 * fuente del resto del panel, para que la página pública (`public-catalog`)
 * refleje los cambios automáticamente.
 *
 * Cubre:
 *   - Listar servicios activos e inactivos del negocio.
 *   - Crear con nombre, unidad (per_kg/per_item/per_hour/flat_rate), precio y
 *     duración estimada.
 *   - Editar valores y desactivar conservando el registro.
 *   - Validación local con mensajes descriptivos; el backend re-valida.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetJSON, apiPostJSON, money } from "@/lib/client";
import { SERVICE_UNITS, unitLabel, type Service, type ServiceUnit } from "@/lib/lavanderia/types";
import type { FruverPanelProps } from "../fruver/FruverPanel";

const CONFIG_ENDPOINT = "/api/get-business-config";
const MANAGE_ENDPOINT = "/api/manage-business";

interface ServiceFormState {
  index: number | null;
  name: string;
  description: string;
  unit: ServiceUnit;
  default_price: string;
  duration: string;
}

interface FormErrors {
  name?: string;
  unit?: string;
  default_price?: string;
  duration?: string;
  general?: string;
}

function emptyForm(): ServiceFormState {
  return {
    index: null,
    name: "",
    description: "",
    unit: "per_kg",
    default_price: "",
    duration: ""
  };
}

/**
 * Validación local previa al envío. Refleja las reglas del backend
 * (`manage-business`): name no vacío, unit ∈ SERVICE_UNITS y default_price
 * numérico ≥ 0.
 */
function validateForm(form: ServiceFormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = "El nombre del servicio es obligatorio.";
  }

  if (!(SERVICE_UNITS as readonly string[]).includes(form.unit)) {
    errors.unit = `La unidad debe ser una de: ${SERVICE_UNITS.join(", ")}.`;
  }

  const raw = form.default_price.trim();
  if (raw === "") {
    errors.default_price = "El precio es obligatorio.";
  } else {
    const price = Number(raw);
    if (!Number.isFinite(price)) {
      errors.default_price = "El precio debe ser un número.";
    } else if (price < 0) {
      errors.default_price = "El precio no puede ser negativo.";
    }
  }

  const rawDuration = form.duration.trim();
  if (rawDuration !== "") {
    const duration = Number(rawDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.duration = "La duración debe ser un número de minutos mayor a 0.";
    }
  }

  return errors;
}

function toPayload(form: ServiceFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    unit: form.unit,
    default_price: Number(form.default_price.trim()),
    duration: form.duration.trim() === "" ? undefined : Number(form.duration.trim())
  };
}

export default function ServicesManager({ businessId, businessName, slug, toastFn }: FruverPanelProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [disablingIndex, setDisablingIndex] = useState<number | null>(null);

  const isEditing = form.index !== null;

  const loadServices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { ok, data } = await apiGetJSON(
      `${CONFIG_ENDPOINT}?slug=${encodeURIComponent(slug)}`
    );
    if (!ok || !data || !Array.isArray(data.services_config)) {
      const message =
        (data && (data.message || data.error)) || "No se pudieron cargar los servicios.";
      setLoadError(typeof message === "string" ? message : "No se pudieron cargar los servicios.");
      setServices([]);
    } else {
      setServices(data.services_config as Service[]);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setErrors({});
  }, []);

  const startEdit = useCallback((service: Service, index: number) => {
    setForm({
      index,
      name: service.name,
      description: service.description ?? "",
      unit: service.unit,
      default_price: String(service.default_price ?? ""),
      duration: service.duration ? String(service.duration) : ""
    });
    setErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (saving) return;

      const validationErrors = validateForm(form);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setErrors({});
      setSaving(true);

      const payload = toPayload(form);

      const { ok, data } = await apiPostJSON(MANAGE_ENDPOINT, {
        action: isEditing ? "update-service" : "add-service",
        business_id: businessId,
        ...(isEditing ? { index: form.index } : {}),
        service: payload
      });

      setSaving(false);

      if (!ok) {
        const field = data?.field as keyof FormErrors | undefined;
        const message =
          (data && (data.message || data.error)) || "No se pudo guardar el servicio.";
        const text = typeof message === "string" ? message : "No se pudo guardar el servicio.";
        if (field && ["name", "unit", "default_price", "duration"].includes(field)) {
          setErrors({ [field]: text });
        } else {
          setErrors({ general: text });
        }
        toastFn(text);
        return;
      }

      toastFn(isEditing ? "Servicio actualizado." : "Servicio creado.");
      resetForm();
      await loadServices();
    },
    [businessId, form, isEditing, loadServices, resetForm, saving, toastFn]
  );

  const handleDisable = useCallback(
    async (index: number) => {
      if (disablingIndex !== null) return;
      setDisablingIndex(index);
      const { ok, data } = await apiPostJSON(MANAGE_ENDPOINT, {
        action: "disable-service",
        business_id: businessId,
        index
      });
      setDisablingIndex(null);
      if (!ok) {
        const message =
          (data && (data.message || data.error)) || "No se pudo desactivar el servicio.";
        toastFn(typeof message === "string" ? message : "No se pudo desactivar el servicio.");
        return;
      }
      toastFn("Servicio desactivado.");
      if (form.index === index) resetForm();
      await loadServices();
    },
    [businessId, disablingIndex, form.index, loadServices, resetForm, toastFn]
  );

  const activeCount = useMemo(() => services.filter((s) => s.active !== false).length, [services]);

  return (
    <div className="flex flex-col gap-6">
      {/* Formulario crear/editar */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-label={isEditing ? "Editar servicio" : "Crear servicio"}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">
            {isEditing ? "Editar servicio" : "Nuevo servicio"}
          </h3>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Cancelar edición
            </button>
          )}
        </div>

        {errors.general && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {errors.general}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="service-name" className="text-sm font-bold text-slate-700">
              Nombre
            </label>
            <input
              id="service-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Lavado estándar"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "service-name-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            {errors.name && (
              <span id="service-name-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.name}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="service-unit" className="text-sm font-bold text-slate-700">
              Unidad de cobro
            </label>
            <select
              id="service-unit"
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value as ServiceUnit }))}
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? "service-unit-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {SERVICE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </select>
            {errors.unit && (
              <span id="service-unit-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.unit}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="service-price" className="text-sm font-bold text-slate-700">
              Precio (COP)
            </label>
            <input
              id="service-price"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={form.default_price}
              onChange={(e) => setForm((prev) => ({ ...prev, default_price: e.target.value }))}
              placeholder="12000"
              aria-invalid={Boolean(errors.default_price)}
              aria-describedby={errors.default_price ? "service-price-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            {errors.default_price && (
              <span id="service-price-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.default_price}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="service-duration" className="text-sm font-bold text-slate-700">
              Duración estimada (minutos, opcional)
            </label>
            <input
              id="service-duration"
              type="number"
              min={1}
              step="1"
              inputMode="numeric"
              value={form.duration}
              onChange={(e) => setForm((prev) => ({ ...prev, duration: e.target.value }))}
              placeholder="180"
              aria-invalid={Boolean(errors.duration)}
              aria-describedby={errors.duration ? "service-duration-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            {errors.duration && (
              <span id="service-duration-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.duration}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="service-description" className="text-sm font-bold text-slate-700">
              Descripción (opcional)
            </label>
            <input
              id="service-description"
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Lavado con detergente premium"
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear servicio"}
          </button>
        </div>
      </form>

      {/* Listado de servicios */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">
            Servicios de {businessName}
          </h3>
          <span className="text-xs font-bold text-slate-500">
            {services.length} servicio(s) · {activeCount} activo(s)
          </span>
        </div>

        {loading ? (
          <div className="grid place-items-center py-8 text-sm font-bold text-slate-500">
            Cargando servicios…
          </div>
        ) : loadError ? (
          <div className="rounded-lg bg-red-50 p-4 text-center">
            <p role="alert" className="text-sm font-bold text-red-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadServices()}
              className="mt-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Reintentar
            </button>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-bold text-slate-600">Aún no tienes servicios.</p>
            <p className="mt-1 text-xs text-slate-500">
              Crea tu primer servicio con el formulario de arriba.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {services.map((service, index) => (
              <li
                key={index}
                className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="grid h-12 w-12 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-lg"
                  >
                    🧺
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{service.name}</span>
                      {service.active === false && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {money.format(Number(service.default_price || 0))} · {unitLabel(service.unit)}
                      {service.duration ? ` · ~${service.duration} min` : ""}
                    </div>
                    {service.description && (
                      <div className="mt-0.5 text-xs text-slate-400">{service.description}</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(service, index)}
                    className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Editar
                  </button>
                  {service.active !== false && (
                    <button
                      type="button"
                      onClick={() => void handleDisable(index)}
                      disabled={disablingIndex === index}
                      className="min-h-[40px] rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {disablingIndex === index ? "Desactivando…" : "Desactivar"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}