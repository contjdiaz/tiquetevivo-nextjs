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
      .from("orders")
      .select(`
        id, order_number, customer_name, customer_phone,
        items_text, total, paid, balance, status,
        created_at, business_id,
        businesses (name, slug)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const orders = (data || []).map((o: any) => ({
      ...o,
      business_name: o.businesses?.name || "",
      business_slug: o.businesses?.slug || ""
    }));

    return json(200, orders);
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const GET = netlifyHandler(handler);