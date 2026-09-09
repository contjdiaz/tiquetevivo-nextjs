/**
 * Tests for the Importador_Inventario pure logic
 * (`.kiro/specs/fruver-sheets-inventory-import`, R3–R10).
 *
 * Covers URL validation (SSRF), CSV parsing, per-row validation, the
 * create/update/deactivate plan and idempotency of re-importing the same sheet.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  ALLOWED_CSV_HOSTS,
  parseCsvText,
  parseInventoryRows,
  planInventoryImport,
  validateCsvUrl,
  parseBoolCell,
  parsePriceCell,
  type CsvInventoryRow,
  type Product
} from "@/lib/fruver/inventory-import";
import type { SaleUnit } from "@/lib/fruver/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    business_id: "biz-1",
    name: "Tomate",
    unit: "kg",
    day_price: 3500,
    photo_url: null,
    is_seasonal: false,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("validateCsvUrl (R3)", () => {
  it("accepts https URLs from allowed Google hosts", () => {
    for (const host of ALLOWED_CSV_HOSTS) {
      const result = validateCsvUrl(`https://${host}/spreadsheets/d/abc/pub?output=csv`);
      expect(result.valid).toBe(true);
      expect(result.reasons).toEqual([]);
    }
  });

  it("rejects non-https schemes even on allowed hosts", () => {
    const result = validateCsvUrl(`http://${ALLOWED_CSV_HOSTS[0]}/x.csv`);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("https");
  });

  it("rejects arbitrary hosts (SSRF) on https", () => {
    const result = validateCsvUrl("https://169.254.169.254/latest/meta-data");
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("no está permitido");
  });

  it("collects every rejection reason (scheme + host + null)", () => {
    const result = validateCsvUrl("ftp://internal.example.com/x.csv");
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseCsvText", () => {
  it("parses quoted fields with commas, newlines and escaped quotes", () => {
    const csv = 'a,"b,c","d\ne","f""g"\n';
    const rows = parseCsvText(csv);
    expect(rows[0]).toEqual(["a", "b,c", "d\ne", 'f"g']);
  });

  it("drops fully empty rows", () => {
    const rows = parseCsvText("a,b\n\n\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("parseInventoryRows (R5, R6)", () => {
  const validCsv = [
    "nombre,unidad,precio",
    "Tomate chonto,kg,3500",
    "Papa,libra,1800",
    "Limón,unidad,300"
  ].join("\n");

  it("parses a valid sheet with the required columns", () => {
    const result = parseInventoryRows(validCsv);
    expect(result.parseError).toBeNull();
    expect(result.missingColumns).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.rows.map((r) => r.name)).toEqual(["Tomate chonto", "Papa", "Limón"]);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, unit: "kg", price: 3500 });
  });

  it("reports missing required columns and aborts", () => {
    const result = parseInventoryRows("nombre,unidad\nTomate,kg\n");
    expect(result.missingColumns).toContain("precio");
    expect(result.rows).toEqual([]);
  });

  it("rejects invalid rows individually and keeps valid ones (R6.5, R6.6)", () => {
    const csv = [
      "nombre,unidad,precio",
      "Tomate,kg,3500",
      ",kg,1000", // nombre vacío
      "Papa,litro,1800", // unidad no permitida
      "Zanahoria,kg,-500", // precio negativo
      "Cebolla,unidad,abc", // precio no numérico
      "Limón,kg,300"
    ].join("\n");

    const result = parseInventoryRows(csv);
    expect(result.rows.map((r) => r.name)).toEqual(["Tomate", "Limón"]);
    const reasons = result.invalid.map((i) => i.reason);
    expect(reasons.join(" | ")).toContain("nombre vacío");
    expect(reasons.join(" | ")).toContain("unidad no permitida");
    expect(reasons.join(" | ")).toContain("precio inválido");
    expect(result.invalid.every((i) => i.rowNumber > 2)).toBe(true);
  });

  it("reads the optional columnas (sku, temporada, activo, foto_url)", () => {
    const csv = [
      "nombre,unidad,precio,sku,temporada,activo,foto_url",
      "Tomate,kg,3500,T-01,si,true,https://img/tomate.jpg",
      "Papa,libra,1800,,,no,"
    ].join("\n");

    const result = parseInventoryRows(csv);
    expect(result.rows[0]).toMatchObject({
      sku: "T-01",
      is_seasonal: true,
      active: true,
      photo_url: "https://img/tomate.jpg"
    });
    expect(result.rows[1]).toMatchObject({ sku: null, is_seasonal: null, active: false });
  });

  it("rejects a sheet with no data rows as malformed", () => {
    const result = parseInventoryRows("nombre,unidad\n");
    expect(result.parseError).not.toBeNull();
  });
});

describe("parseBoolCell / parsePriceCell", () => {
  it("parses supported truthy/falsy tokens and null for empty", () => {
    expect(parseBoolCell("SI")).toBe(true);
    expect(parseBoolCell(" sí ")).toBe(true);
    expect(parseBoolCell("1")).toBe(true);
    expect(parseBoolCell("no")).toBe(false);
    expect(parseBoolCell("0")).toBe(false);
    expect(parseBoolCell("")).toBeNull();
    expect(parseBoolCell("talvez")).toBeNull();
  });

  it("parses prices and rejects negatives/non-numeric", () => {
    expect(parsePriceCell("3500")).toBe(3500);
    expect(parsePriceCell(" $3.500 ")).toBe(3500);
    expect(parsePriceCell("")).toBeNull();
    expect(parsePriceCell("-5")).toBeNull();
    expect(parsePriceCell("abc")).toBeNull();
  });
});

describe("planInventoryImport (R7, R8, R10)", () => {
  const row = (partial: Partial<CsvInventoryRow>): CsvInventoryRow => ({
    rowNumber: 2,
    name: "Tomate",
    unit: "kg",
    price: 3500,
    sku: null,
    is_seasonal: null,
    active: null,
    photo_url: null,
    ...partial
  });

  it("creates unmatched rows, updates matched ones and deactivates the rest", () => {
    const existing = [
      product({ id: "a1", name: "Tomate", active: true }), // matched by name → update
      product({ id: "s1", name: "Antiguo", active: true }) // not in sheet → deactivate
    ];
    const rows = [
      row({ name: "Tomate" }), // update (match by name)
      row({ name: "Papa", price: 1800 }), // create
      row({ name: "Con SKU", sku: "NEW-1" }), // create
      row({ name: "Con SKU 2", sku: "a1" }) // update (match by sku → existing id a1)
    ];

    const { plan, invalid } = planInventoryImport(rows, existing);

    expect(invalid).toEqual([]);
    expect(plan.creates.map((r) => r.name)).toEqual(["Papa", "Con SKU"]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.map((u) => u.product.id).sort()).toEqual(["a1", "a1"]);
    expect(plan.deactivateIds).toEqual(["s1"]);
  });

  it("marks rows sharing a match key as invalid (R7.4)", () => {
    const rows = [
      row({ name: "Tomate" }),
      row({ name: "tomate", price: 999 }), // same normalized name
      row({ name: "Otro" })
    ];
    const { plan, invalid } = planInventoryImport(rows, []);
    expect(plan.creates.map((r) => r.name)).toEqual(["Otro"]);
    expect(invalid).toHaveLength(2);
    expect(invalid.every((i) => i.reason === "clave duplicada")).toBe(true);
  });

  it("is idempotent: re-planning after applying yields zero creates and deactivations (R10.2, R10.3)", () => {
    const existing = [
      product({ id: "a1", name: "Tomate", active: true }),
      product({ id: "s1", name: "Desaparece", active: true })
    ];
    const rows = [
      row({ name: "Tomate" }),
      row({ name: "Papa", price: 1800, sku: "P-01" })
    ];

    const apply = (catalog: Product[], sheet: CsvInventoryRow[]): Product[] => {
      const { plan } = planInventoryImport(sheet, catalog);
      const next = catalog.map((p) => ({ ...p }));
      const byId = new Map(next.map((p) => [p.id, p]));
      for (const r of plan.creates) {
        next.push(
          product({
            // El sku se mapea al `id` del producto (igual que en la DB).
            id: r.sku ?? `name-${r.name}`,
            name: r.name,
            unit: r.unit,
            day_price: r.price
          })
        );
      }
      for (const { row: r, product: p } of plan.updates) {
        const target = byId.get(p.id)!;
        target.name = r.name;
        target.unit = r.unit;
        target.day_price = r.price;
        if (r.photo_url) target.photo_url = r.photo_url;
        if (r.is_seasonal !== null) target.is_seasonal = r.is_seasonal;
        if (r.active !== null) target.active = r.active;
      }
      for (const id of plan.deactivateIds) {
        const target = byId.get(id);
        if (target) target.active = false;
      }
      return next;
    };

    const afterFirst = apply(existing, rows);
    const second = planInventoryImport(rows, afterFirst);
    expect(second.plan.creates).toHaveLength(0);
    expect(second.plan.deactivateIds).toHaveLength(0);
  });
});