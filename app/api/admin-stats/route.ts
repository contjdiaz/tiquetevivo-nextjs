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

    const { count: bizCount } = await supabase
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .eq("active", true);

    const { count: orderCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    const { data: revenueData } = await supabase
      .from("orders")
      .select("total");
    const revenue = (revenueData || []).reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

    const { count: msgCount } = await supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true });

    const { data: recentBiz } = await supabase
      .from("businesses")
      .select(`
        id, name, slug, active, created_at,
        verticals (emoji, name)
      `)
      .order("created_at", { ascending: false })
      .limit(10);

    const recentBusinesses = (recentBiz || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      active: b.active,
      created_at: b.created_at,
      vertical_emoji: b.verticals?.emoji || "",
      vertical_name: b.verticals?.name || ""
    }));

    return json(200, {
      businesses: bizCount || 0,
      orders: orderCount || 0,
      revenue,
      messages: msgCount || 0,
      recentBusinesses
    });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const GET = netlifyHandler(handler);