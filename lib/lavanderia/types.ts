/**
 * Lavanderia domain types and public (sanitized) interfaces.
 *
 * These types model the "lavanderia" vertical entities: services are read from
 * the business' `services_config` JSONB (ordered by their `position`/insertion
 * order and only `active` ones are offered), and quotes are persisted in the
 * shared `quotes` table with `vertical_slug = 'lavanderia'`. The `Public*`
 * interfaces describe the whitelisted shapes exposed through public endpoints;
 * they intentionally exclude internal/tenant fields.
 */

/** How a laundry service quantity is priced (R2.2). */
export const SERVICE_UNITS = ["per_kg", "per_item", "per_hour", "flat_rate"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/** Laundry service as configured in `businesses.services_config`. */
export interface Service {
  /** Human-readable service name (e.g. "Lavado estándar"). */
  name: string;
  description?: string | null;
  /** Base price; for per_kg services the price-per-kilo used by the quoter. */
  default_price: number;
  /** Estimated duration in minutes (informational). */
  duration?: number | null;
  unit: ServiceUnit;
  /** Whether the service is currently offered on the public quoter. */
  active?: boolean;
  /** Per-service custom fields merged into the quote (e.g. segment). */
  custom_fields?: Record<string, unknown> | null;
}

/** A single selected service line in a lavanderia quote. */
export interface ServiceQuoteLine {
  service_id: string;
  name: string;
  unit: ServiceUnit;
  day_price: number;
  qty: number;
}

/** Public projection of a Service: only quote-safe fields. */
export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  price: number;
  /** Lead time in minutes, or null when not configured. */
  duration: number | null;
}

/** Public projection of a laundry business' catalog payload. */
export interface PublicCatalogPayload {
  business: {
    slug: string;
    name: string;
    color: string | null;
    logo_url: string | null;
  };
  services: PublicService[];
}

/** Maps a `Service.unit` to a readable unit label shown to customers. */
export function unitLabel(unit: ServiceUnit): string {
  switch (unit) {
    case "per_kg":
      return "por kilo";
    case "per_item":
      return "por prenda";
    case "per_hour":
      return "por hora";
    case "flat_rate":
    default:
      return "tarifa fija";
  }
}