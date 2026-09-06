import { getBusinessBySlug, getBearerToken, getAuthUser, getUserBusinessRole, hasPermission, json, supabaseAdmin } from "@/lib/api/_utils";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const slug = event.queryStringParameters?.slug || "majesty";
    const supabase = supabaseAdmin();
    const business = await getBusinessBySlug(supabase, slug);

    let verticalEmoji = "";
    let verticalName = "";
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("emoji, name")
        .eq("id", business.vertical_id)
        .single();
      if (vertical) {
        verticalEmoji = vertical.emoji || "";
        verticalName = vertical.name || "";
      }
    }

    const token = getBearerToken(event);
    const user = await getAuthUser(supabase, token);

    let isAuthenticated = false;
    if (user) {
      const role = await getUserBusinessRole(supabase, user.id, business.id);
      if (role && hasPermission(role, "read")) {
        isAuthenticated = true;
      }
    }

    const paymentConfig = business.payment_config || {};

    if (isAuthenticated) {
      return json(200, {
        business_id: business.id,
        business_name: business.name,
        business_slug: business.slug,
        business_color: business.color || null,
        plan: business.plan || "free",
        vertical_emoji: verticalEmoji,
        vertical_name: verticalName,
        services_config: business.services_config || [],
        custom_fields_config: business.custom_fields_config || [],
        status_flow_config: business.status_flow_config || [],
        whatsapp_templates_config: business.whatsapp_templates_config || {},
        loyalty_config: business.loyalty_config || { enabled: true, target: 5 },
        reactivation_config: business.reactivation_config || { enabled: true, threshold_days: 30, monthly_limit: 50 },
        payment_config: paymentConfig
      });
    }

    const loyaltyConfig = business.loyalty_config || { enabled: true, target: 5 };
    return json(200, {
      business_name: business.name,
      business_slug: business.slug,
      business_color: business.color || null,
      vertical_emoji: verticalEmoji,
      vertical_name: verticalName,
      status_flow_config: business.status_flow_config || [],
      custom_fields_config: business.custom_fields_config || [],
      loyalty_config: {
        enabled: loyaltyConfig.enabled,
        target: loyaltyConfig.target
      },
      payment_config: paymentConfig
    });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const GET = netlifyHandler(handler);