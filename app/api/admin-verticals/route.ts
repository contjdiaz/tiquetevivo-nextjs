import { json, supabaseAdmin } from "@/lib/api/_utils";
import { validateAdminToken } from "@/lib/api/_admin-auth";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const auth = await validateAdminToken(event);
  if (!auth.valid) return auth.error;

  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("verticals")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    return json(200, data || []);
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const GET = netlifyHandler(handler);