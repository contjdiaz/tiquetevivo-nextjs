/**
 * CORS diferenciado por tipo de endpoint (Req 14).
 *
 * Se distinguen dos clases de endpoint:
 *  - "public": accesibles desde el navegador del cliente final sin autenticacion
 *    (tiquete publico, catalogo publico, check-slug). Permiten cualquier origen
 *    porque no exponen datos privados y son consumidos desde dominios variados.
 *  - "private": endpoints administrativos o autenticados (panel, admin-*). NO deben
 *    responder con `Access-Control-Allow-Origin: *`. En su lugar reflejan el origen
 *    solo si esta en la lista blanca (`ALLOWED_ORIGINS`), o el origen propio de la app.
 *
 * La clasificacion concreta de endpoints se documenta en
 * `docs/api-contracts-and-cors.md`.
 */

export type CorsType = "public" | "private";

const BASE_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
} as const;

/**
 * Devuelve la lista blanca de origenes permitidos para endpoints privados.
 * Se configura via `ALLOWED_ORIGINS` (separados por coma). Si no hay config,
 * se usa `APP_URL`/`NEXT_PUBLIC_APP_URL` como unico origen permitido.
 */
export function getAllowedOrigins(): string[] {
  const raw =
    process.env.ALLOWED_ORIGINS ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Construye los headers CORS segun el tipo de endpoint.
 *
 * @param type      "public" (origen abierto) o "private" (allowlist).
 * @param origin    Origen de la peticion (header `Origin`), si esta disponible.
 */
export function corsHeaders(type: CorsType = "public", origin?: string | null): Record<string, string> {
  if (type === "public") {
    return {
      ...BASE_HEADERS,
      "Access-Control-Allow-Origin": "*"
    };
  }

  // Privado: reflejar el origen solo si esta permitido.
  const allowed = getAllowedOrigins();
  const requestOrigin = (origin || "").trim();
  const isAllowed = requestOrigin !== "" && allowed.includes(requestOrigin);
  const allowOrigin = isAllowed ? requestOrigin : allowed[0] || "null";

  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
}
