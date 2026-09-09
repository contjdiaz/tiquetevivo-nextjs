"use client";

/**
 * CatalogManager — Panel del Dueño: gestión de catálogo de productos (R4).
 *
 * CRUD sobre los productos de la vertical fruver reutilizando el endpoint
 * existente `manage-products` (acciones `list` / `create` / `update` /
 * `deactivate`). Todas las operaciones se hacen del lado cliente con los
 * helpers de `lib/client.ts` (`apiPostJSON`, `compressImage`, `money`) y van
 * firmadas con el token del operador, por lo que el backend exige el permiso
 * `manage_business` y aísla por `business_id` (R4.1, R4.7).
 *
 * Cubre:
 *   - Listar productos activos e inactivos del negocio (R4.1).
 *   - Crear con nombre, unidad (kg/libra/unidad) y precio ≥ 0 (R4.2).
 *   - Editar y actualizar `updated_at` en el servidor (R4.3).
 *   - Desactivar conservando el registro (R4.4).
 *   - Adjuntar foto opcional con el flujo de fotos existente (R4.5).
 *   - Validación local con mensajes de error descriptivos; el backend re-valida
 *     y devuelve `{ message, field }` que también se muestran (R4.6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPostJSON, compressImage, money } from "@/lib/client";
import { SALE_UNITS, type SaleUnit, type Product } from "@/lib/fruver/types";
import type { FruverPanelProps } from "./FruverPanel";

const ENDPOINT = "/api/manage-products";

const UNIT_LABELS: Record<SaleUnit, string> = {
  kg: "Kilogramo (kg)",
  libra: "Libra",
  unidad: "Unidad"
};

interface ProductFormState {
  id: string | null;
  name: string;
  unit: SaleUnit;
  day_price: string;
  is_seasonal: boolean;
  photo_url: string | null;
  /** Nueva foto seleccionada (data URL) pendiente de subir, si la hay. */
  photo_base64: string | null;
}

interface FormErrors {
  name?: string;
  unit?: string;
  day_price?: string;
  photo?: string;
  general?: string;
}

interface ImportSummary {
  created: number;
  updated: number;
  deactivated: number;
  invalid: { rowNumber: number; reason: string }[];
}

function emptyForm(): ProductFormState {
  return {
    id: null,
    name: "",
    unit: "kg",
    day_price: "",
    is_seasonal: false,
    photo_url: null,
    photo_base64: null
  };
}

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as SaleUnit] ?? unit;
}

/**
 * Validación local previa al envío. Refleja las reglas del backend
 * (`validateUnit`, `validateDayPrice`) para dar feedback inmediato (R4.6).
 */
function validateForm(form: ProductFormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = "El nombre del producto es obligatorio.";
  }

  if (!(SALE_UNITS as readonly string[]).includes(form.unit)) {
    errors.unit = `La unidad debe ser una de: ${SALE_UNITS.join(", ")}.`;
  }

  const raw = form.day_price.trim();
  if (raw === "") {
    errors.day_price = "El precio del día es obligatorio.";
  } else {
    const price = Number(raw);
    if (!Number.isFinite(price)) {
      errors.day_price = "El precio del día debe ser un número.";
    } else if (price < 0) {
      errors.day_price = "El precio del día no puede ser negativo.";
    }
  }

  return errors;
}

export default function CatalogManager({ businessId, businessName, toastFn }: FruverPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const isEditing = form.id !== null;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { ok, data } = await apiPostJSON(ENDPOINT, { action: "list", business_id: businessId });
    if (!ok) {
      const message =
        (data && (data.message || data.error)) || "No se pudo cargar el catálogo.";
      setLoadError(typeof message === "string" ? message : "No se pudo cargar el catálogo.");
      setProducts([]);
    } else {
      setProducts(Array.isArray(data) ? (data as Product[]) : []);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const startEdit = useCallback((product: Product) => {
    setForm({
      id: product.id,
      name: product.name,
      unit: product.unit,
      day_price: String(product.day_price ?? ""),
      is_seasonal: Boolean(product.is_seasonal),
      photo_url: product.photo_url ?? null,
      photo_base64: null
    });
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handlePhotoChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setForm((prev) => ({ ...prev, photo_base64: dataUrl }));
      setErrors((prev) => ({ ...prev, photo: undefined }));
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        photo: err?.message || "No se pudo procesar la imagen."
      }));
    }
  }, []);

  const removePhoto = useCallback(() => {
    setForm((prev) => ({ ...prev, photo_base64: null, photo_url: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      const productPayload: Record<string, unknown> = {
        name: form.name.trim(),
        unit: form.unit,
        day_price: Number(form.day_price.trim()),
        is_seasonal: form.is_seasonal
      };
      if (form.photo_base64) {
        productPayload.photo_base64 = form.photo_base64;
      } else if (isEditing) {
        // Preserva/limpia la foto existente en edición.
        productPayload.photo_url = form.photo_url;
      }
      if (isEditing) {
        productPayload.id = form.id;
      }

      const { ok, data } = await apiPostJSON(ENDPOINT, {
        action: isEditing ? "update" : "create",
        business_id: businessId,
        product: productPayload
      });

      setSaving(false);

      if (!ok) {
        const field = data?.field as keyof FormErrors | undefined;
        const message =
          (data && (data.message || data.error)) ||
          "No se pudo guardar el producto.";
        const text = typeof message === "string" ? message : "No se pudo guardar el producto.";
        if (field && ["name", "unit", "day_price"].includes(field)) {
          setErrors({ [field]: text });
        } else {
          setErrors({ general: text });
        }
        toastFn(text);
        return;
      }

      toastFn(isEditing ? "Producto actualizado." : "Producto creado.");
      resetForm();
      await loadProducts();
    },
    [businessId, form, isEditing, loadProducts, resetForm, saving, toastFn]
  );

  const handleDeactivate = useCallback(
    async (product: Product) => {
      if (deactivatingId) return;
      setDeactivatingId(product.id);
      const { ok, data } = await apiPostJSON(ENDPOINT, {
        action: "deactivate",
        business_id: businessId,
        product_id: product.id
      });
      setDeactivatingId(null);
      if (!ok) {
        const message =
          (data && (data.message || data.error)) || "No se pudo desactivar el producto.";
        toastFn(typeof message === "string" ? message : "No se pudo desactivar el producto.");
        return;
      }
      toastFn("Producto desactivado.");
      if (form.id === product.id) resetForm();
      await loadProducts();
    },
    [businessId, deactivatingId, form.id, loadProducts, resetForm, toastFn]
  );

  const activeCount = useMemo(
    () => products.filter((p) => p.active).length,
    [products]
  );

  const handleImport = useCallback(async () => {
    if (importing) return;
    const url = importUrl.trim();
    if (url === "") {
      setImportError("La URL de la hoja publicada es obligatoria.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    const { ok, data } = await apiPostJSON("/api/import-inventory", {
      business_id: businessId,
      url
    });
    setImporting(false);
    if (!ok) {
      const message =
        (data && (data.message || data.error)) ||
        "No se pudo importar el inventario.";
      setImportError(typeof message === "string" ? message : "No se pudo importar el inventario.");
      return;
    }
    setImportSummary(data);
    toastFn("Inventario importado desde la hoja.");
    await loadProducts();
  }, [businessId, importUrl, importing, loadProducts, toastFn]);

  const currentPhoto = form.photo_base64 || form.photo_url;

  return (
    <div className="flex flex-col gap-6">
      {/* Importar inventario desde Google Sheets */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-extrabold text-slate-900">
          Importar inventario desde Google Sheets
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Publica tu hoja como CSV (Archivo → Compartir → Publicar en la web → CSV), pega la URL y
          la hoja será la fuente de verdad del catálogo: crea productos nuevos, actualiza los que
          coincidan (por <code className="rounded bg-slate-100 px-1">sku</code> o por nombre) y
          desactiva los que ya no estén en la hoja.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
            aria-label="URL de la hoja publicada como CSV"
            aria-invalid={Boolean(importError)}
            disabled={importing}
            className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing}
            className="min-h-[40px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {importing ? "Importando…" : "Importar inventario"}
          </button>
        </div>
        {importing && (
          <p role="status" className="mt-2 text-xs font-bold text-slate-500">
            Descargando y aplicando la hoja…
          </p>
        )}
        {importError && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {importError}
          </p>
        )}
        {importSummary && (
          <div role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <p className="font-bold text-emerald-700">
              Importación completada: {importSummary.created} creado(s) · {importSummary.updated}{" "}
              actualizado(s) · {importSummary.deactivated} desactivado(s).
            </p>
            {importSummary.invalid.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-emerald-700/80">
                {importSummary.invalid.map((row, index) => (
                  <li key={`${row.rowNumber}-${index}`}>
                    Fila {row.rowNumber}: {row.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Formulario crear/editar */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-label={isEditing ? "Editar producto" : "Crear producto"}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">
            {isEditing ? "Editar producto" : "Nuevo producto"}
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
            <label htmlFor="product-name" className="text-sm font-bold text-slate-700">
              Nombre
            </label>
            <input
              id="product-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Tomate chonto"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "product-name-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            {errors.name && (
              <span id="product-name-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.name}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="product-unit" className="text-sm font-bold text-slate-700">
              Unidad de venta
            </label>
            <select
              id="product-unit"
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value as SaleUnit }))}
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? "product-unit-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {SALE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
            {errors.unit && (
              <span id="product-unit-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.unit}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="product-price" className="text-sm font-bold text-slate-700">
              Precio del día (COP)
            </label>
            <input
              id="product-price"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={form.day_price}
              onChange={(e) => setForm((prev) => ({ ...prev, day_price: e.target.value }))}
              placeholder="3500"
              aria-invalid={Boolean(errors.day_price)}
              aria-describedby={errors.day_price ? "product-price-error" : undefined}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            {errors.day_price && (
              <span id="product-price-error" role="alert" className="text-xs font-bold text-red-600">
                {errors.day_price}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 md:pt-6">
            <input
              id="product-seasonal"
              type="checkbox"
              checked={form.is_seasonal}
              onChange={(e) => setForm((prev) => ({ ...prev, is_seasonal: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <label htmlFor="product-seasonal" className="text-sm font-bold text-slate-700">
              Producto de temporada
            </label>
          </div>
        </div>

        {/* Foto opcional */}
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="product-photo" className="text-sm font-bold text-slate-700">
            Foto del producto (opcional)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {currentPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentPhoto}
                alt={form.name ? `Foto de ${form.name}` : "Vista previa del producto"}
                className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
              />
            )}
            <input
              id="product-photo"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              aria-describedby={errors.photo ? "product-photo-error" : undefined}
              className="text-sm text-slate-600 file:mr-3 file:min-h-[40px] file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-brand-700 hover:file:bg-brand-100"
            />
            {currentPhoto && (
              <button
                type="button"
                onClick={removePhoto}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Quitar foto
              </button>
            )}
          </div>
          {errors.photo && (
            <span id="product-photo-error" role="alert" className="text-xs font-bold text-red-600">
              {errors.photo}
            </span>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </form>

      {/* Listado de productos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">
            Catálogo de {businessName}
          </h3>
          <span className="text-xs font-bold text-slate-500">
            {products.length} producto(s) · {activeCount} activo(s)
          </span>
        </div>

        {loading ? (
          <div className="grid place-items-center py-8 text-sm font-bold text-slate-500">
            Cargando catálogo…
          </div>
        ) : loadError ? (
          <div className="rounded-lg bg-red-50 p-4 text-center">
            <p role="alert" className="text-sm font-bold text-red-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="mt-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Reintentar
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-bold text-slate-600">Aún no tienes productos.</p>
            <p className="mt-1 text-xs text-slate-500">
              Crea tu primer producto con el formulario de arriba.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  {product.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.photo_url}
                      alt={`Foto de ${product.name}`}
                      className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="grid h-12 w-12 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-lg"
                    >
                      🥬
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{product.name}</span>
                      {product.is_seasonal && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          Temporada
                        </span>
                      )}
                      {!product.active && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {money.format(Number(product.day_price || 0))} · {unitLabel(product.unit)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(product)}
                    className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Editar
                  </button>
                  {product.active && (
                    <button
                      type="button"
                      onClick={() => void handleDeactivate(product)}
                      disabled={deactivatingId === product.id}
                      className="min-h-[40px] rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {deactivatingId === product.id ? "Desactivando…" : "Desactivar"}
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
