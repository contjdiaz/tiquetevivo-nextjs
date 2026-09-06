/**
 * Customers module — first-class customer entity helpers.
 * A customer is unique per (business_id, phone). All functions are defensive:
 * failures never block order creation.
 */

export async function upsertCustomer(
  supabase: any,
  params: any
): Promise<{ id: string | null; created: boolean }> {
  const { businessId, name, phone } = params;
  if (!businessId || !phone) return { id: null, created: false };

  const nowIso = new Date().toISOString();
  const incrementOrder = params.incrementOrder !== false;

  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id, orders_count")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .single();

  if (!findErr && existing) {
    const update: Record<string, any> = {};
    if (name) update.name = name;
    if (params.email) update.email = params.email;
    if (params.address) update.address = params.address;
    if (incrementOrder) {
      update.orders_count = (existing.orders_count || 0) + 1;
      update.last_order_at = nowIso;
    }
    if (Object.keys(update).length > 0) {
      const { error: updErr } = await supabase
        .from("customers")
        .update(update)
        .eq("id", existing.id);
      if (updErr) {
        console.error("[customers] update failed:", updErr.message);
      }
    }
    return { id: existing.id, created: false };
  }

  const insertPayload = {
    business_id: businessId,
    name: name || "Cliente",
    phone,
    email: params.email || null,
    address: params.address || null,
    first_seen_at: nowIso,
    last_order_at: incrementOrder ? nowIso : null,
    orders_count: incrementOrder ? 1 : 0
  };

  const { data: created, error: insErr } = await supabase
    .from("customers")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr) {
    const { data: raced } = await supabase
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .single();
    if (raced) return { id: raced.id, created: false };
    console.error("[customers] insert failed:", insErr.message);
    return { id: null, created: false };
  }

  return { id: created.id, created: true };
}

export async function getCustomerMetrics(
  supabase: any,
  customerId: string
): Promise<{ ordersCount: number; daysSinceLast: number | null; avgFrequencyDays: number | null }> {
  const empty = { ordersCount: 0, daysSinceLast: null, avgFrequencyDays: null };
  if (!customerId) return empty;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (error || !orders || orders.length === 0) return empty;

  const times = orders.map((o: any) => new Date(o.created_at).getTime()).filter((t: number) => !Number.isNaN(t));
  if (times.length === 0) return empty;

  const dayMs = 24 * 60 * 60 * 1000;
  const last = times[times.length - 1];
  const daysSinceLast = Math.floor((Date.now() - last) / dayMs);

  let avgFrequencyDays: number | null = null;
  if (times.length >= 2) {
    let sumGaps = 0;
    for (let i = 1; i < times.length; i++) sumGaps += times[i] - times[i - 1];
    avgFrequencyDays = Math.round(sumGaps / (times.length - 1) / dayMs);
  }

  return { ordersCount: orders.length, daysSinceLast, avgFrequencyDays };
}