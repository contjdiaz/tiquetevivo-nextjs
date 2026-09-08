/**
 * Property Test: Product creation persistence
 * Feature: fruver-catalog-quoting, Property 3: Persistencia de creación de Producto
 *
 * **Validates: Requirements 2.1**
 *
 * For any valid Product created through the Gestor_Catalogo, the persisted record
 * is associated with the Negocio's `business_id` and defaults to `active = true`,
 * preserving the validated fields (name, unit, day_price).
 *
 * The test runs the `create` action of `app/api/manage-products/impl.ts` against an
 * in-memory mock Supabase client (no real I/O), per the tasks.md notes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { SALE_UNITS } from "@/lib/fruver/types";

// ──────────────────────────────────────────────────────────────────
// In-memory mock Supabase client. Records inserts into `products` and
// returns the inserted record merged with a generated id + timestamps,
// mirroring the shape a real `insert().select().single()` returns.
// ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/_utils", () => {
  let insertedProducts: any[] = [];

  const mockSupabase = {
    from(table: string) {
      return {
        insert(record: any) {
          if (table === "products") insertedProducts.push(record);
          return {
            select() {
              return {
                single() {
                  const data = {
                    id: "product-uuid-123",
                    ...record,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
      };
    },
    _getInsertedProducts() {
      return insertedProducts;
    },
    _reset() {
      insertedProducts = [];
    },
  };

  return {
    supabaseAdmin: () => mockSupabase,
    requireAuth: vi.fn().mockResolvedValue({ user: { id: "auth-user-1" }, role: "owner" }),
    json: (statusCode: number, body: any) => ({
      statusCode,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    parseBody: (event: any) => (event.body ? JSON.parse(event.body) : {}),
  };
});

// Photo storage is not exercised in this property (no photo_base64 provided).
vi.mock("@/lib/api/_photo-storage", () => ({
  uploadPhoto: vi.fn().mockResolvedValue({ path: "biz/products/photo.jpg" }),
}));

const { handler } = await import("@/app/api/manage-products/impl");
const { supabaseAdmin } = await import("@/lib/api/_utils");

// Smart generator for a valid product: non-empty (post-trim) name, a valid
// sale unit, and a finite non-negative day price.
const validProductArb = fc.record({
  name: fc
    .string({ minLength: 1, maxLength: 60 })
    .filter((s) => s.trim().length > 0),
  unit: fc.constantFrom(...SALE_UNITS),
  day_price: fc
    .double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
    .map((n) => Math.round(n * 100) / 100),
  is_seasonal: fc.boolean(),
});

// Business ids across tenants to confirm association is driven by the request.
const businessIdArb = fc.uuid();

describe("Feature: fruver-catalog-quoting, Property 3: Persistencia de creación de Producto", () => {
  beforeEach(() => {
    (supabaseAdmin() as any)._reset();
    vi.clearAllMocks();
  });

  it("persists a created product with the business_id and active=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        validProductArb,
        businessIdArb,
        async (product, businessId) => {
          const supabase = supabaseAdmin() as any;
          supabase._reset();

          const event = {
            httpMethod: "POST",
            body: JSON.stringify({
              action: "create",
              business_id: businessId,
              product,
            }),
          };

          const response = await handler(event as any);
          const body = JSON.parse(response.body);

          // Property: creation succeeds (201).
          expect(response.statusCode).toBe(201);

          // Property: exactly one product was persisted.
          const inserted = supabase._getInsertedProducts();
          expect(inserted.length).toBe(1);
          const record = inserted[0];

          // Property: persisted record is associated with the request's business_id.
          expect(record.business_id).toBe(businessId);
          expect(body.business_id).toBe(businessId);

          // Property: active defaults to true.
          expect(record.active).toBe(true);
          expect(body.active).toBe(true);

          // Property: validated fields are preserved.
          expect(record.name).toBe(product.name.trim());
          expect(record.unit).toBe(product.unit);
          expect(record.day_price).toBe(product.day_price);
          expect(record.is_seasonal).toBe(product.is_seasonal);
        }
      ),
      { numRuns: 100 }
    );
  });
});
