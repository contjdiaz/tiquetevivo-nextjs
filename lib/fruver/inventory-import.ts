/**
 * Inventory import helpers for the "fruver" vertical.
 *
 * Pure, DOM-free and I/O-free logic backing the Importador_Inventario
 * (`.kiro/specs/fruver-sheets-inventory-import`): URL validation for SSRF
 * prevention, CSV parsing, per-row validation and the create/update/deactivate
 * plan. The endpoint (`/api/import-inventory`) performs auth, download and the
 * database writes; everything here is unit/property-testable in isolation.
 *
 * The sheet is treated as the source of truth: valid rows become products
 * (created or updated), and existing active products that do not appear in the
 * sheet are deactivated — never deleted, so the operation is reversible.
 */

import { normalizeSearch } from "./search";
import { SALE_UNITS, type Product, type SaleUnit } from "./types";

/** Max sheet size accepted (bytes). Guards against oversized payloads. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Download timeout for the published CSV. */
export const CSV_DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * Hosts allowed as the source of a published CSV (Google Sheets / Google Docs).
 * Used to prevent SSRF: only these exact hosts may be fetched by the server.
 */
export const ALLOWED_CSV_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "sheets.google.com"
] as const;

/** Required columns of the published sheet. */
export const REQUIRED_CSV_COLUMNS = ["nombre", "unidad", "precio"] as const;

/** Optional columns recognized in the published sheet. */
export const OPTIONAL_CSV_COLUMNS = [
  "foto_url",
  "temporada",
  "activo",
  "sku"
] as const;

/** A single parsed, validated row from the sheet (excludes invalid rows). */
export interface CsvInventoryRow {
  /** Spreadsheet row number (1-based; header is row 1). */
  rowNumber: number;
  name: string;
  unit: SaleUnit;
  price: number;
  /** Optional `sku`; used as the match key against `products.id`. */
  sku: string | null;
  /** Optional boolean; null when the `temporada` column is absent/empty. */
  is_seasonal: boolean | null;
  /** Optional boolean; null when the `activo` column is absent/empty. */
  active: boolean | null;
  /** Optional image URL; null when empty. */
  photo_url: string | null;
}

/** A rejected data row with its sheet row number and reason. */
export interface InvalidRow {
  rowNumber: number;
  reason: string;
}

/** Result of parsing a published CSV into validated rows. */
export interface ParseInventoryResult {
  /** Validated rows eligible for the import plan. */
  rows: CsvInventoryRow[];
  /** Rows rejected by per-row validation. */
  invalid: InvalidRow[];
  /** Required columns missing from the header. */
  missingColumns: string[];
  /** Non-null when the content cannot be interpreted as a CSV. */
  parseError: string | null;
}

/** A single planned update: an existing product reconciled to a row. */
export interface UpdatePlanEntry {
  row: CsvInventoryRow;
  product: Product;
}

/** Result of planning an import against the current catalog. */
export interface ImportPlan {
  /** Valid rows in the sheet that match no existing product. */
  creates: CsvInventoryRow[];
  updates: UpdatePlanEntry[];
  /** Ids of active products to deactivate (not present in the sheet). */
  deactivateIds: string[];
}

/** Public summary returned to the Dueño after applying the plan. */
export interface ImportSummary {
  created: number;
  updated: number;
  deactivated: number;
  invalid: InvalidRow[];
}

/** Result of URL validation, with every rejection reason collected. */
export interface CsvUrlValidationResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates a published-CSV URL: must use `https` and one of the allowed
 * Google hosts. Reports every violation found (spec R3.4).
 */
export function validateCsvUrl(value: unknown): CsvUrlValidationResult {
  const reasons: string[] = [];

  if (value == null || typeof value !== "string" || value.trim() === "") {
    return { valid: false, reasons: ["La URL es obligatoria"] };
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { valid: false, reasons: ["La URL no es válida"] };
  }

  if (parsed.protocol !== "https:") {
    reasons.push("El esquema de la URL debe ser https");
  }

  if (!(ALLOWED_CSV_HOSTS as readonly string[]).includes(parsed.hostname)) {
    reasons.push(`El host "${parsed.hostname}" no está permitido`);
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Parses CSV text into rows of fields, handling quoted fields (commas, escaped
 * quotes and newlines inside quotes). Tolerant parser: it never throws; empty
 * rows are dropped.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

/** Parses a boolean cell value from supported Spanish/English tokens. */
export function parseBoolCell(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  if (["true", "1", "si", "sí", "yes", "s", "x", "activo", "1.0"].includes(value)) return true;
  if (["false", "0", "no", "n", "inactivo", "0.0"].includes(value)) return false;
  return null;
}

/** Parses a price cell (strips currency/whitespace) or returns null. */
export function parsePriceCell(raw: string): number | null {
  let cleaned = raw.replace(/[$]/g, "").replace(/\s/g, "").trim();
  if (cleaned === "") return null;

  if (cleaned.includes(",")) {
    // Formato es-CO/es-ES: la coma es el separador decimal. Se quitan los
    // puntos de miles y se convierte la coma en punto.
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}$/.test(cleaned)) {
    // "3.500" sin coma: el punto final con 3 dígitos es separador de miles.
    cleaned = cleaned.replace(/\./g, "");
  }

  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const normalizeColumnName = (value: string) => value.trim().toLowerCase();

/**
 * Parses a published CSV into validated inventory rows.
 *
 * The first row is the header. Required columns (`nombre`, `unidad`,
 * `precio`) must be present or the whole import aborts. Optional columns
 * (`foto_url`, `temporada`, `activo`, `sku`) are recognized if present.
 * Each data row is validated individually; invalid rows are collected with
 * their reason and do not abort the rest (spec R5, R6). An invalid boolean /
 * price cell marks its row as invalid.
 */
export function parseInventoryRows(csvText: string): ParseInventoryResult {
  const table = parseCsvText(csvText);

  const parseError =
    table.length === 0 ||
    table.every((cells) => cells.every((c) => c.trim() === "")) ||
    table.length <= 1
      ? "El contenido descargado no es un CSV con datos"
      : null;
  if (parseError) {
    return { rows: [], invalid: [], missingColumns: [], parseError };
  }

  const header = table[0].map(normalizeColumnName);
  const colIndex = new Map<string, number>();
  header.forEach((name, index) => {
    if (!colIndex.has(name)) colIndex.set(name, index);
  });

  const missingColumns = [...REQUIRED_CSV_COLUMNS].filter((col) => !colIndex.has(col));
  if (missingColumns.length > 0) {
    return { rows: [], invalid: [], missingColumns, parseError: null };
  }

  const cell = (dataRow: string[], name: string): string =>
    colIndex.has(name) ? (dataRow[colIndex.get(name)!] ?? "") : "";

  const rows: CsvInventoryRow[] = [];
  const invalid: InvalidRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const dataRow = table[i];
    const rowNumber = i + 1;
    const isEmptyRow = dataRow.every((c) => c.trim() === "");
    if (isEmptyRow) continue;

    const nameRaw = cell(dataRow, "nombre");
    const unitRaw = cell(dataRow, "unidad");
    const priceRaw = cell(dataRow, "precio");
    const tempoRaw = cell(dataRow, "temporada");
    const activoRaw = cell(dataRow, "activo");
    const skuRaw = cell(dataRow, "sku");
    const photoRaw = cell(dataRow, "foto_url");

    if (nameRaw.trim() === "") {
      invalid.push({ rowNumber, reason: "nombre vacío" });
    }
    if (!(SALE_UNITS as readonly string[]).includes(unitRaw.trim().toLowerCase())) {
      invalid.push({
        rowNumber,
        reason: `unidad no permitida: "${unitRaw.trim() || "(vacío)"}"`
      });
    }
    const price = parsePriceCell(priceRaw);
    if (price === null) {
      invalid.push({ rowNumber, reason: `precio inválido: "${priceRaw}"` });
    }

    const isSeasonal = parseBoolCell(tempoRaw);
    if (tempoRaw.trim() !== "" && isSeasonal === null) {
      invalid.push({ rowNumber, reason: `temporada inválida: "${tempoRaw}"` });
    }
    const active = parseBoolCell(activoRaw);
    if (activoRaw.trim() !== "" && active === null) {
      invalid.push({ rowNumber, reason: `activo inválido: "${activoRaw}"` });
    }

    const rowIsValid =
      nameRaw.trim() !== "" &&
      (SALE_UNITS as readonly string[]).includes(unitRaw.trim().toLowerCase()) &&
      price !== null &&
      (tempoRaw.trim() === "" || isSeasonal !== null) &&
      (activoRaw.trim() === "" || active !== null);

    if (!rowIsValid) continue;

    rows.push({
      rowNumber,
      name: nameRaw.trim(),
      unit: unitRaw.trim().toLowerCase() as SaleUnit,
      price,
      sku: skuRaw.trim() !== "" ? skuRaw.trim() : null,
      is_seasonal: isSeasonal,
      active,
      photo_url: photoRaw.trim() !== "" ? photoRaw.trim() : null
    });
  }

  return { rows, invalid, missingColumns: [], parseError: null };
}

/**
 * Computes the match key for a row: `sku:<value>` when the row carries a sku,
 * otherwise `name:<normalized-name>`. Rows without a sku match existing
 * products by their normalized name.
 */
export function rowMatchKey(row: CsvInventoryRow): string {
  if (row.sku) return `sku:${row.sku}`;
  return `name:${normalizeSearch(row.name)}`;
}

/**
 * Plans the import against the current catalog.
 *
 * Rows sharing the same match key within a single sheet are all treated as
 * invalid (key duplicada) and excluded. Valid unmatched rows become creates;
 * valid matched rows become updates. Active existing products not matched by
 * any valid row are scheduled for deactivation (spec R7, R8). The returned
 * plan leaves the catalog unchanged until applied by the endpoint.
 */
export function planInventoryImport(
  rows: CsvInventoryRow[],
  products: Product[]
): { plan: ImportPlan; invalid: InvalidRow[] } {
  const keyCount = new Map<string, number>();
  for (const row of rows) {
    const key = rowMatchKey(row);
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }

  const keep: CsvInventoryRow[] = [];
  const invalid: InvalidRow[] = [];
  for (const row of rows) {
    if ((keyCount.get(rowMatchKey(row)) ?? 0) > 1) {
      invalid.push({ rowNumber: row.rowNumber, reason: "clave duplicada" });
    } else {
      keep.push(row);
    }
  }

  const byId = new Map<string, Product>();
  const byName = new Map<string, Product>();
  for (const p of products) {
    byId.set(p.id, p);
    byName.set(normalizeSearch(p.name), p);
  }

  const creates: CsvInventoryRow[] = [];
  const updates: UpdatePlanEntry[] = [];
  const matchedIds = new Set<string>();

  for (const row of keep) {
    const product = row.sku ? byId.get(row.sku) : byName.get(normalizeSearch(row.name));
    if (product) {
      updates.push({ row, product });
      matchedIds.add(product.id);
    } else {
      creates.push(row);
    }
  }

  const deactivateIds = products
    .filter((p) => p.active && !matchedIds.has(p.id))
    .map((p) => p.id);

  return {
    plan: { creates, updates, deactivateIds },
    invalid
  };
}

/** Converts a boolean-ish row value (or null) into the Product field default. */
export function applyRowBoolean(value: boolean | null, fallback: boolean): boolean {
  return value === null ? fallback : value;
}