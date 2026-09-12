/**
 * Domain types for TiqueteVivo.
 *
 * Introduced incrementally (Req 17) to replace `any` on the surfaces touched
 * by the app-quality-improvements spec: orders, businesses, business config
 * and custom fields. These types describe the *observed* shapes derived from
 * `lib/client.ts#normalizeOrder`, `lib/api/_vertical-config.ts#getBusinessConfig`,
 * `lib/api/_validators.ts#validateCustomFields` and `app/api/save-business`.
 *
 * Scope is intentionally narrow (no big-bang): they are permissive where the
 * runtime data is still loosely shaped (e.g. index signatures on config maps)
 * so existing code typechecks while gaining meaningful structure.
 */

// ─── Custom fields ──────────────────────────────────────────────────────

/** Field types supported by `validateCustomFields`. */
export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "time"
  | "boolean"
  | "select";

/**
 * A single value stored/received for a custom field. Its concrete type depends
 * on the field's `field_type` (string for text/date/time/select, number for
 * number, boolean for boolean).
 */
export type CustomFieldValue = string | number | boolean | null;

/** A bag of custom field values keyed by `field_key`. */
export type CustomFieldValues = Record<string, CustomFieldValue>;

/**
 * Definition of a custom field as stored in `businesses.custom_fields_config`
 * and validated by `validateCustomFields`.
 */
export interface CustomFieldDefinition {
  field_key: string;
  display_label: string;
  field_type: CustomFieldType;
  required?: boolean;
  /** Allowed values when `field_type` is `select`. */
  options?: string[];
  default_value?: CustomFieldValue;
  [key: string]: unknown;
}

// ─── Supporting config shapes ───────────────────────────────────────────

/** A service offered by the business (`businesses.services_config`). */
export interface ServiceConfig {
  name: string;
  description?: string;
  default_price?: number;
  duration?: number;
  unit?: "per_kg" | "per_item" | "per_hour" | "flat_rate" | string;
  active?: boolean;
  [key: string]: unknown;
}

/** An entry of the business status flow (`businesses.status_flow_config`). */
export interface StatusFlowEntry {
  status_key: string;
  display_label: string;
  [key: string]: unknown;
}

// ─── Business ───────────────────────────────────────────────────────────

/**
 * A business record as persisted in the `businesses` table / returned by
 * `save-business` and `getBusinessBySlug`. Kept partial-friendly for the
 * fields that are optional at rest.
 */
export interface Business {
  id: string;
  slug: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  color?: string | null;
  logo_url?: string | null;
  plan?: string;
  vertical_id?: string | null;
  services_config?: ServiceConfig[];
  custom_fields_config?: CustomFieldDefinition[];
  status_flow_config?: StatusFlowEntry[];
  whatsapp_templates_config?: Record<string, unknown>;
  payment_config?: Record<string, unknown>;
  loyalty_config?: Record<string, unknown>;
  promotions_config?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ─── Business config (panel view) ───────────────────────────────────────

/**
 * The flattened, panel-facing configuration shape (as used by
 * `app/panel/page.tsx` and produced from the business + vertical join).
 */
export interface BusinessConfig {
  business_id: string;
  business_name: string;
  business_slug: string;
  business_color: string;
  plan: string;
  vertical_emoji: string;
  vertical_name: string;
  services_config: ServiceConfig[];
  custom_fields_config: CustomFieldDefinition[];
  status_flow_config: StatusFlowEntry[];
  whatsapp_templates_config: Record<string, unknown>;
  currency: string;
  payment_config: Record<string, unknown>;
}

// ─── Order ──────────────────────────────────────────────────────────────

/**
 * Normalized order shape produced by `normalizeOrder` and consumed across the
 * panel and public ticket surfaces.
 */
export interface Order {
  id: string;
  order_number: string | number;
  customer_name: string;
  customer_phone: string;
  items_text: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
  due_date: string;
  ticket_token: string;
  created_at: string;
  updated_at: string;
  slug: string;
  custom_fields: CustomFieldValues;
  intake_photo_url?: string | null;
  intake_photo_taken_at?: string | null;
  delivery_photo_url?: string | null;
  delivery_photo_taken_at?: string | null;
  intake_confirmed_at?: string | null;
  intake_confirmed_ip?: string | null;
  delivery_confirmed_at?: string | null;
  delivery_confirmed_ip?: string | null;
  [key: string]: unknown;
}
