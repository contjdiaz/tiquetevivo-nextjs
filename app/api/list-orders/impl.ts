import { getBusinessBySlug, getClientIp, json, requireAuth, supabaseAdmin } from "@/lib/api/_utils";
import { getLoyaltySummary } from "@/lib/api/_loyalty";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { getSignedPhotoUrl } from "@/lib/api/_photo-storage";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

async function replacePhotoUrlsWithSigned(supabase: any, orders: any[]) {
  for (const order of orders) {
    if (order.intake_photo_url) {
      try {
        order.intake_photo_url = await getSignedPhotoUrl(supabase, order.intake_photo_url);
      } catch (err: any) {
        console.error("[Photo] Failed to sign intake URL:", err.message);
      }
    }
    if (order.delivery_photo_url) {
      try {
        order.delivery_photo_url = await getSignedPhotoUrl(supabase, order.delivery_photo_url);
      } catch (err: any) {
        console.error("[Photo] Failed to sign delivery URL:", err.message);
      }
    }
  }
}

function stripSensitiveFields(order: any) {
  if (!order) return order;
  const { customer_name, customer_phone, internal_notes, notes, ...safeOrder } = order;
  return safeOrder;
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const supabase = supabaseAdmin();
    const ticketToken = event.queryStringParameters?.ticket_token;

    if (ticketToken) {
      const clientIp = getClientIp(event);
      const rateLimitKey = `${clientIp}:list-orders-ticket`;
      const rateResult = checkRateLimit(rateLimitKey, 30, 60000);

      if (!rateResult.allowed) {
        return {
          statusCode: 429,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Content-Type": "application/json",
            "Retry-After": String(rateResult.retryAfter)
          },
          body: JSON.stringify({ error: "Too many requests" })
        };
      }

      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("ticket_token", ticketToken)
        .single();

      if (error || !order) {
        return json(404, { error: "Order not found" });
      }

      const safeOrder = stripSensitiveFields(order);

      await replacePhotoUrlsWithSigned(supabase, [safeOrder]);

      const includeBusiness = event.queryStringParameters?.include_business === "1";
      if (includeBusiness) {
        const { data: business } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", order.business_id)
          .single();

        let verticalEmoji: string | null = null;
        if (business?.vertical_id) {
          const { data: vertical } = await supabase
            .from("verticals")
            .select("emoji, slug, name")
            .eq("id", business.vertical_id)
            .single();
          if (vertical) {
            verticalEmoji = vertical.emoji;
          }
        }

        let loyalty: any = null;
        if (order.customer_phone && business?.loyalty_config?.enabled !== false) {
          try {
            const loyaltyResult = await getLoyaltySummary(supabase, order.customer_phone, business.id);
            if (loyaltyResult.success) {
              loyalty = loyaltyResult.summary;
            }
          } catch (err: any) {
            console.error("[Loyalty] getLoyaltySummary error:", err.message);
          }
        }

        return json(200, {
          orders: [safeOrder],
          business: business
            ? {
                name: business.name,
                phone: business.phone,
                slug: business.slug,
                color: business.color || null,
                plan: business.plan || "free",
                status_flow_config: business.status_flow_config || [],
                custom_fields_config: business.custom_fields_config || [],
                loyalty_config: business.loyalty_config || { enabled: true, target: 5 },
                vertical_emoji: verticalEmoji,
                payment_config: business.payment_config || {}
              }
            : null,
          loyalty
        });
      }

      return json(200, { orders: [safeOrder] });
    }

    const slug = event.queryStringParameters?.slug || "majesty";
    const status = event.queryStringParameters?.status;
    const includeBusiness = event.queryStringParameters?.include_business === "1";
    const business = await getBusinessBySlug(supabase, slug);

    const authResult = await requireAuth(supabase, event, {
      permission: "read",
      businessId: business.id
    });

    if (authResult.error) {
      return authResult.error;
    }

    let query = supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(Number(event.queryStringParameters?.limit || 100));

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      await replacePhotoUrlsWithSigned(supabase, data);
    }

    if (includeBusiness) {
      let verticalEmoji: string | null = null;
      if (business.vertical_id) {
        const { data: vertical } = await supabase
          .from("verticals")
          .select("emoji, slug, name")
          .eq("id", business.vertical_id)
          .single();
        if (vertical) {
          verticalEmoji = vertical.emoji;
        }
      }

      let loyalty: any = null;
      const customerPhone = event.queryStringParameters?.phone
        || (data && data.length > 0 ? data[0].customer_phone : null);

      if (customerPhone && business.loyalty_config?.enabled !== false) {
        try {
          const loyaltyResult = await getLoyaltySummary(supabase, customerPhone, business.id);
          if (loyaltyResult.success) {
            loyalty = loyaltyResult.summary;
          }
        } catch (err: any) {
          console.error("[Loyalty] getLoyaltySummary error:", err.message);
        }
      }

      return json(200, {
        orders: data || [],
        business: {
          name: business.name,
          phone: business.phone,
          slug: business.slug,
          color: business.color || null,
          plan: business.plan || "free",
          status_flow_config: business.status_flow_config || [],
          custom_fields_config: business.custom_fields_config || [],
          loyalty_config: business.loyalty_config || { enabled: true, target: 5 },
          vertical_emoji: verticalEmoji,
          payment_config: business.payment_config || {}
        },
        loyalty
      });
    }

    const includeLoyalty = event.queryStringParameters?.include_loyalty === "1";
    if (includeLoyalty && business.loyalty_config?.enabled !== false) {
      const rawPhones: any[] = (data || []).map((o: any) => o.customer_phone).filter((p: any) => !!p);
      const uniquePhones: string[] = [...new Set(rawPhones as string[])];
      const loyaltySummaries: Record<string, any> = {};
      for (const phone of uniquePhones) {
        try {
          const result = await getLoyaltySummary(supabase, phone, business.id);
          if (result.success) {
            loyaltySummaries[phone] = result.summary;
          }
        } catch (err: any) {
          console.error("[Loyalty] operator summary error:", err.message);
        }
      }
      return json(200, { orders: data || [], loyalty_summaries: loyaltySummaries });
    }

    return json(200, data || []);
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}
