import { createClient } from "@supabase/supabase-js";
import type { NetlifyEvent, NetlifyResponse } from "./netlify-adapter";
import { corsHeaders, type CorsType } from "./_cors";

/**
 * Respuesta JSON con CORS publico (`Access-Control-Allow-Origin: *`).
 * Es el comportamiento historico; se mantiene por retrocompatibilidad para los
 * endpoints publicos existentes.
 */
export function json(statusCode: number, body: unknown): NetlifyResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders("public"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

/**
 * Respuesta JSON con CORS diferenciado por tipo de endpoint (Req 14).
 * Usar `type: "private"` en endpoints administrativos/autenticados para evitar
 * `Access-Control-Allow-Origin: *`. El `origin` proviene del header `Origin`.
 */
export function jsonWithCors(
  statusCode: number,
  body: unknown,
  type: CorsType,
  origin?: string | null
): NetlifyResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders(type, origin),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

/** Extrae el header `Origin` de una peticion, normalizado. */
export function getOrigin(event: NetlifyEvent): string | null {
  const headers = event.headers || {};
  const value = headers["origin"] || headers["Origin"];
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export function parseBody(event: NetlifyEvent): Record<string, any> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (err: any) {
    throw new Error(`Invalid JSON body: ${err.message}`);
  }
}

export function supabaseAdmin(): any {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL and SUPABASE_SECRET_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function slugify(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extracts the client IP from a request event.
 * Tries the common proxy headers in the same order as the Netlify original.
 */
export function getClientIp(event: NetlifyEvent): string {
  const headers = event.headers || {};
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);
  return (
    first(headers["x-nf-client-connection-ip"]) ||
    first(headers["x-forwarded-for"])?.split(",")[0]?.trim() ||
    first(headers["client-ip"]) ||
    first(headers["x-real-ip"]) ||
    "unknown"
  );
}

export async function getBusinessBySlug(supabase: any, slug: string): Promise<any> {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data;
}

export function getBearerToken(event: NetlifyEvent): string | null {
  const headers = event.headers || {};
  const authHeader = headers["authorization"] || headers["Authorization"];
  if (!authHeader) return null;
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function getAuthUser(supabase: any, token: string | null): Promise<any> {
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function getUserBusinessRole(
  supabase: any,
  authUserId: string,
  businessId: string
): Promise<string | null> {
  if (!authUserId || !businessId) return null;
  const { data, error } = await supabase
    .from("business_users")
    .select("role, active")
    .eq("auth_user_id", authUserId)
    .eq("business_id", businessId)
    .single();
  if (error || !data || !data.active) return null;
  return data.role;
}

export function hasPermission(role: string, action: string): boolean {
  if (role === "superadmin") return true;
  if (role === "owner") {
    return ["read", "create_order", "update_order", "delete_order", "manage_business"].includes(action);
  }
  if (role === "operator") {
    return ["read", "create_order", "update_order"].includes(action);
  }
  return false;
}

export async function requireAuth(
  supabase: any,
  event: NetlifyEvent,
  options: { permission?: string; businessId?: string } = {}
): Promise<{ error?: NetlifyResponse; user?: any; role?: string }> {
  const token = getBearerToken(event);
  const user = await getAuthUser(supabase, token);
  if (!user) {
    return { error: json(401, { error: true, message: "Authentication required" }) };
  }

  if (options.permission) {
    const businessId = options.businessId;
    if (!businessId) {
      return { error: json(400, { error: true, message: "businessId is required for permission check" }) };
    }
    const role = await getUserBusinessRole(supabase, user.id, businessId);
    if (!role || !hasPermission(role, options.permission)) {
      return { error: json(403, { error: true, message: "Insufficient permissions" }) };
    }
    return { user, role };
  }

  return { user };
}