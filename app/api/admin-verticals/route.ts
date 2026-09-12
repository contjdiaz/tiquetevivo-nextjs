import { supabaseAdmin } from "@/lib/api/_utils";
import { validateAdminToken, adminJson } from "@/lib/api/_admin-auth";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return adminJson(event, 200, {});
  if (event.httpMethod !== "GET") return adminJson(event, 405, { error: "Method not allowed" });

  const auth = await validateAdminToken(event);
  if (!auth.valid) return auth.error;

  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("verticals")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    return adminJson(event, 200, data || []);
  } catch (error: any) {
    return adminJson(event, 500, { error: error.message });
  }
}

export const GET = netlifyHandler(handler);