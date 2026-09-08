import { json, parseBody, supabaseAdmin } from "@/lib/api/_utils";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const { email, password } = body;

    if (!email || !password) {
      return json(400, { error: true, message: "Email and password are required" });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session) {
      return json(401, { error: true, message: error?.message || "Invalid credentials" });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("business_users")
      .select("business_id, role, active, businesses:business_id (slug, name)")
      .eq("auth_user_id", data.user.id)
      .eq("active", true);

    if (membershipError) throw membershipError;

    return json(200, {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        memberships: memberships || []
      }
    });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
