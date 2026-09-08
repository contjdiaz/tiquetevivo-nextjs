import { supabaseAdmin } from "@/lib/api/_utils";
import { sendWhatsAppMessage, logWhatsAppMessage } from "@/lib/api/_whatsapp";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const FREE_PLAN_MONTHLY_LIMIT = 10;
const REACTIVATION_TEMPLATE_NAME = "customer_reactivation";
const COUPON_EXPIRATION_DAYS = 7;
const COUPON_DEFAULT_TYPE = "PERCENT";
const COUPON_DEFAULT_VALUE = 10;

export function isWithinSendWindow() {
  const now = new Date();
  const colombiaOffset = -5;
  const colombiaHour = (now.getUTCHours() + colombiaOffset + 24) % 24;
  return colombiaHour >= 8 && colombiaHour < 20;
}

export function generateCouponCode(prefix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix ? prefix.toUpperCase().slice(0, 3) : "";
  const targetLen = prefix ? 8 : 6;
  while (code.length < targetLen) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function withRetry(fn: () => Promise<any>, maxAttempts = 3) {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function getEnabledBusinesses(supabase: any) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, plan, reactivation_config, whatsapp_templates")
    .eq("active", true);

  if (error) {
    console.error("[cron-reactivation] Error fetching businesses:", error.message);
    return [];
  }

  return (data || []).filter(
    (b: any) => b.reactivation_config && b.reactivation_config.enabled === true
  );
}

async function getMonthlyMessageCount(supabase: any, businessId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count, error } = await supabase
    .from("reactivation_log")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("sent_at", startOfMonth);

  if (error) {
    console.error("[cron-reactivation] Error counting monthly messages:", error.message);
    return 0;
  }

  return count || 0;
}

async function getInactiveCustomers(supabase: any, businessId: string, thresholdDays: number) {
  const { data: customerOrders, error: ordersError } = await supabase
    .from("orders")
    .select("customer_phone, customer_name, items_text, created_at, status")
    .eq("business_id", businessId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false });

  if (ordersError || !customerOrders || customerOrders.length === 0) {
    return [];
  }

  const customerMap = new Map();
  for (const order of customerOrders) {
    const phone = order.customer_phone;
    if (!phone) continue;

    if (!customerMap.has(phone)) {
      customerMap.set(phone, {
        phone,
        customer_name: order.customer_name,
        last_service: order.items_text,
        last_order_date: order.created_at,
        orders: []
      });
    }
    customerMap.get(phone).orders.push(order);
  }

const now = new Date();
    const inactiveCustomers = [];

    for (const [phone, customer] of customerMap) {
      const orderCount = customer.orders.length;
      const lastOrderDate = new Date(customer.last_order_date);
      const daysSinceLast = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    let effectiveThreshold = thresholdDays;

    if (orderCount >= 2) {
      const orderDates = customer.orders
        .map((o: any) => new Date(o.created_at).getTime())
        .sort((a: number, b: number) => b - a);

      let totalGap = 0;
      for (let i = 0; i < orderDates.length - 1; i++) {
        totalGap += orderDates[i] - orderDates[i + 1];
      }
      const avgFrequencyMs = totalGap / (orderDates.length - 1);
      const avgFrequencyDays = avgFrequencyMs / (1000 * 60 * 60 * 24);
      const dynamicThreshold = avgFrequencyDays * 1.5;

      effectiveThreshold = Math.max(thresholdDays, dynamicThreshold);
    }

    if (daysSinceLast > effectiveThreshold) {
      inactiveCustomers.push({
        phone,
        customer_name: customer.customer_name || "",
        last_service: customer.last_service || "",
        days_inactive: daysSinceLast,
        last_order_date: customer.last_order_date
      });
    }
  }

  return inactiveCustomers;
}

async function filterExclusions(supabase: any, businessId: string, candidates: any[]) {
  if (candidates.length === 0) return [];

  const phones = candidates.map((c) => c.phone);

  const { data: loyaltyRecords } = await supabase
    .from("customer_loyalty")
    .select("phone_number, marketing_opt_in")
    .in("phone_number", phones);

  const optedOutPhones = new Set(
    (loyaltyRecords || [])
      .filter((r: any) => r.marketing_opt_in === false)
      .map((r: any) => r.phone_number)
  );

  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentMessages } = await supabase
    .from("reactivation_log")
    .select("phone")
    .eq("business_id", businessId)
    .gte("sent_at", fifteenDaysAgo)
    .in("phone", phones);

  const recentlyMessagedPhones = new Set(
    (recentMessages || []).map((r: any) => r.phone)
  );

  return candidates.filter((customer) => {
    if (optedOutPhones.has(customer.phone)) return false;
    if (recentlyMessagedPhones.has(customer.phone)) return false;
    return true;
  });
}

async function createCoupon(supabase: any, businessId: string) {
  const expiresAt = new Date(Date.now() + COUPON_EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const code = generateCouponCode();

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      business_id: businessId,
      code,
      type: COUPON_DEFAULT_TYPE,
      value: COUPON_DEFAULT_VALUE,
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const retryCode = generateCouponCode("R");
      const { data: retryData, error: retryError } = await supabase
        .from("coupons")
        .insert({
          business_id: businessId,
          code: retryCode,
          type: COUPON_DEFAULT_TYPE,
          value: COUPON_DEFAULT_VALUE,
          expires_at: expiresAt
        })
        .select()
        .single();

      if (retryError) return { coupon: null, error: retryError.message };
      return { coupon: retryData, error: null };
    }
    return { coupon: null, error: error.message };
  }

  return { coupon: data, error: null };
}

async function sendReactivationMessage(supabase: any, { business, customer, coupon }: any) {
  const couponLink = `${process.env.URL || "https://tiquetevivo.com"}/coupon?code=${coupon.code}`;

  const businessTemplates = business.whatsapp_templates || null;
  const template = selectTemplate("customer_reactivation", businessTemplates, null);

  const messageText = renderTemplate(
    template,
    {
      customer_name: customer.customer_name,
      last_service: customer.last_service,
      days_inactive: customer.days_inactive,
      coupon_link: couponLink
    },
    { name: business.name }
  );

  const sendFn = async () => {
    return await sendWhatsAppMessage({
      to: customer.phone,
      templateName: REACTIVATION_TEMPLATE_NAME,
      templateParams: [
        customer.customer_name,
        business.name,
        String(customer.days_inactive),
        customer.last_service,
        couponLink
      ]
    });
  };

  let sendResult: any;
  try {
    sendResult = await withRetry(sendFn, 3);
  } catch (error: any) {
    sendResult = { success: false, error: error.message };
  }

  const logStatus = sendResult.success ? "SENT" : "FAILED";
  await supabase.from("reactivation_log").insert({
    business_id: business.id,
    phone: customer.phone,
    coupon_id: coupon.id,
    status: logStatus
  });

  await logWhatsAppMessage(supabase, {
    orderId: null,
    businessId: business.id,
    phone: customer.phone,
    templateName: REACTIVATION_TEMPLATE_NAME,
    messageBody: messageText,
    metaMessageId: sendResult.messageId || null,
    status: sendResult.success ? "SENT" : (sendResult.dryRun ? "DRY_RUN" : "FAILED"),
    errorMessage: sendResult.error || null
  });

  return {
    success: sendResult.success || sendResult.dryRun === true,
    error: sendResult.error || null
  };
}

async function processBusinessReactivation(supabase: any, business: any) {
  const stats = { sent: 0, skipped: 0, errors: 0 };

  const reactivationConfig = business.reactivation_config || {};
  const thresholdDays = reactivationConfig.threshold_days || 30;

  const isPaid = business.plan === "paid";
  const monthlyLimit = isPaid
    ? (reactivationConfig.monthly_limit || 50)
    : FREE_PLAN_MONTHLY_LIMIT;

  const monthlyCount = await getMonthlyMessageCount(supabase, business.id);
  const remainingQuota = Math.max(0, monthlyLimit - monthlyCount);

  if (remainingQuota <= 0) {
    console.log(`[cron-reactivation] Business ${business.slug}: monthly limit reached (${monthlyCount}/${monthlyLimit})`);
    return stats;
  }

  const inactiveCustomers = await getInactiveCustomers(supabase, business.id, thresholdDays);

  if (inactiveCustomers.length === 0) {
    return stats;
  }

  const eligibleCustomers = await filterExclusions(supabase, business.id, inactiveCustomers);

  if (eligibleCustomers.length === 0) {
    return stats;
  }

  const customersToProcess = eligibleCustomers.slice(0, remainingQuota);

  for (const customer of customersToProcess) {
    try {
      const { coupon, error: couponError } = await createCoupon(supabase, business.id);

      if (couponError || !coupon) {
        console.error(`[cron-reactivation] Coupon creation failed for ${customer.phone}:`, couponError);
        stats.errors++;
        continue;
      }

      const result = await sendReactivationMessage(supabase, {
        business,
        customer,
        coupon
      });

      if (result.success) {
        stats.sent++;
      } else {
        stats.errors++;
        console.warn(`[cron-reactivation] Message failed for ${customer.phone}:`, result.error);
      }
    } catch (error: any) {
      stats.errors++;
      console.error(`[cron-reactivation] Error processing customer ${customer.phone}:`, error.message);
    }
  }

  stats.skipped = eligibleCustomers.length - customersToProcess.length;
  return stats;
}

async function runReactivation(): Promise<Record<string, any>> {
  console.log("[cron-reactivation] Starting daily reactivation run...");

  if (process.env.REACTIVATION_ENABLED === "false") {
    console.log("[cron-reactivation] Reactivation disabled via environment variable.");
    return { disabled: true };
  }

  if (!isWithinSendWindow()) {
    console.log("[cron-reactivation] Outside send window (08:00-20:00 Colombia). Deferring to next execution.");
    return { deferred: true, reason: "outside_send_window" };
  }

  const supabase = supabaseAdmin();
  const results = { total_sent: 0, total_skipped: 0, total_errors: 0, businesses_processed: 0 };

  try {
    const businesses = await getEnabledBusinesses(supabase);

    if (businesses.length === 0) {
      console.log("[cron-reactivation] No businesses with reactivation enabled.");
      return results;
    }

    console.log(`[cron-reactivation] Processing ${businesses.length} businesses...`);

    for (const business of businesses) {
      try {
        const stats = await processBusinessReactivation(supabase, business);
        results.total_sent += stats.sent;
        results.total_skipped += stats.skipped;
        results.total_errors += stats.errors;
        results.businesses_processed++;

        console.log(
          `[cron-reactivation] Business ${business.slug}: sent=${stats.sent}, skipped=${stats.skipped}, errors=${stats.errors}`
        );
      } catch (error: any) {
        console.error(`[cron-reactivation] Error processing business ${business.slug}:`, error.message);
        results.total_errors++;
      }
    }
  } catch (error: any) {
    console.error("[cron-reactivation] Fatal error:", error.message);
  }

  console.log(
    `[cron-reactivation] Completed. Sent: ${results.total_sent}, Skipped: ${results.total_skipped}, Errors: ${results.total_errors}, Businesses: ${results.businesses_processed}`
  );

  return results;
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const headerSecret = event.headers?.["x-cron-secret"] || event.headers?.["x-auth-token"] || "";
    if (headerSecret !== secret) {
      return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "unauthorized" }) };
    }
  }

  const results = await runReactivation();
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(results) };
}
