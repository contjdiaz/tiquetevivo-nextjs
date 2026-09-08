/**
 * Unit (example) tests for the Gestor_Promociones create action.
 * Feature: fruver-catalog-quoting
 *
 * Covers creation of banner, combo and discount_code promotions, each
 * persisted scoped by `business_id` (R3.1, R3.2, R3.3).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the payload passed to promotions.insert for assertions.
let capturedInsert: any = null;

function createMockSupabase() {
  capturedInsert = null;
  return {
    from: vi.fn((table: string) => ({
      insert: vi.fn((payload: any) => {
        if (table === "promotions") capturedInsert = payload;
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: "promo-generated-id", ...payload },
                error: null,
              })
            ),
          })),
        };
      }),
    })),
  };
}

// Mock the _utils module: real json/parseBody behaviour, mocked supabase + auth.
vi.mock("@/lib/api/_utils", () => ({
  json: (statusCode: number, body: any) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  parseBody: (event: any) => (event.body ? JSON.parse(event.body) : {}),
  supabaseAdmin: vi.fn(),
  // requireAuth succeeds: no `error` field means authorized.
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "owner-1" }, role: "owner" }),
}));

import { supabaseAdmin } from "@/lib/api/_utils";
import { handler } from "@/app/api/manage-promotions/impl";

const BUSINESS_ID = "biz-fruver-123";

function makeEvent(body: any) {
  return {
    httpMethod: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: JSON.stringify(body),
  };
}

// A validity window that is always well-formed (ends_at >= starts_at).
const STARTS_AT = "2025-01-01T00:00:00.000Z";
const ENDS_AT = "2025-12-31T23:59:59.000Z";

describe("Feature: fruver-catalog-quoting — manage-promotions create", () => {
  beforeEach(() => {
    (supabaseAdmin as any).mockReturnValue(createMockSupabase());
  });

  it("creates a banner promotion persisted scoped by business_id (R3.1)", async () => {
    const result = await handler(
      makeEvent({
        action: "create",
        business_id: BUSINESS_ID,
        promotion: {
          type: "banner",
          text: "¡Ofertas de la semana!",
          starts_at: STARTS_AT,
          ends_at: ENDS_AT,
        },
      })
    );

    expect(result.statusCode).toBe(201);
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert.business_id).toBe(BUSINESS_ID);
    expect(capturedInsert.type).toBe("banner");
    expect(capturedInsert.text).toBe("¡Ofertas de la semana!");
    expect(capturedInsert.active).toBe(true);

    const body = JSON.parse(result.body);
    expect(body.business_id).toBe(BUSINESS_ID);
    expect(body.type).toBe("banner");
  });

  it("creates a combo promotion with products and discount persisted scoped by business_id (R3.2)", async () => {
    const result = await handler(
      makeEvent({
        action: "create",
        business_id: BUSINESS_ID,
        promotion: {
          type: "combo",
          product_ids: ["prod-1", "prod-2"],
          discount_percent: 15,
          starts_at: STARTS_AT,
          ends_at: ENDS_AT,
        },
      })
    );

    expect(result.statusCode).toBe(201);
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert.business_id).toBe(BUSINESS_ID);
    expect(capturedInsert.type).toBe("combo");
    expect(capturedInsert.product_ids).toEqual(["prod-1", "prod-2"]);
    expect(capturedInsert.discount_percent).toBe(15);
    expect(capturedInsert.active).toBe(true);

    const body = JSON.parse(result.body);
    expect(body.business_id).toBe(BUSINESS_ID);
    expect(body.type).toBe("combo");
  });

  it("creates a discount_code promotion persisted scoped by business_id (R3.3)", async () => {
    const result = await handler(
      makeEvent({
        action: "create",
        business_id: BUSINESS_ID,
        promotion: {
          type: "discount_code",
          code: "FRUVER10",
          discount_percent: 10,
          starts_at: STARTS_AT,
          ends_at: ENDS_AT,
        },
      })
    );

    expect(result.statusCode).toBe(201);
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert.business_id).toBe(BUSINESS_ID);
    expect(capturedInsert.type).toBe("discount_code");
    expect(capturedInsert.code).toBe("FRUVER10");
    expect(capturedInsert.discount_percent).toBe(10);
    expect(capturedInsert.active).toBe(true);

    const body = JSON.parse(result.body);
    expect(body.business_id).toBe(BUSINESS_ID);
    expect(body.type).toBe("discount_code");
  });

  it("persists each promotion under its own business_id (multi-tenant isolation)", async () => {
    const otherBusiness = "biz-other-999";
    await handler(
      makeEvent({
        action: "create",
        business_id: otherBusiness,
        promotion: {
          type: "banner",
          text: "Otro negocio",
          starts_at: STARTS_AT,
          ends_at: ENDS_AT,
        },
      })
    );

    expect(capturedInsert.business_id).toBe(otherBusiness);
    expect(capturedInsert.business_id).not.toBe(BUSINESS_ID);
  });
});
