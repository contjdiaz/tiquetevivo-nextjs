import { json, parseBody } from "@/lib/api/_utils";
import { createHash, randomBytes } from "crypto";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

/**
 * @deprecated Flujo de login admin HEREDADO basado en `ADMIN_PASSWORD`.
 * El flujo activo del panel es `POST /api/auth-login` (Supabase Auth) con rol
 * `superadmin` validado en los endpoints `admin-*` via `validateAdminToken`.
 * Se conserva solo por compatibilidad con el token admin firmado. Migrar a
 * `auth-login` y retirar. Ver `docs/api-contracts-and-cors.md` (seccion 3).
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const { username, password } = body;

    if (!username || !password) {
      return json(400, { error: "Username and password are required" });
    }

    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    const expectedPass = process.env.ADMIN_PASSWORD;

    if (!expectedPass) {
      return json(500, { error: "Admin not configured" });
    }

    const inputHash = createHash("sha256").update(`${username}:${password}`).digest("hex");
    const expectedHash = createHash("sha256").update(`${expectedUser}:${expectedPass}`).digest("hex");

    if (inputHash !== expectedHash) {
      return json(401, { error: "Credenciales inválidas" });
    }

    const token = randomBytes(32).toString("hex");

    const secret = process.env.ADMIN_PASSWORD;
    const expiry = Date.now() + (8 * 60 * 60 * 1000);
    const payload = `${expiry}`;
    const signature = createHash("sha256").update(`${payload}:${secret}`).digest("hex");
    const sessionToken = `${payload}.${signature}`;

    return json(200, { token: sessionToken, user: expectedUser });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}
