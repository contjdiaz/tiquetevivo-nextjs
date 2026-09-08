// Seed a demo fruver business "fruver-patty" with products and a promotion.
// Uses the service-role secret key from .env.local (bypasses RLS).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const map = {};
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) map[m[1]] = m[2].trim();
}
const supabase = createClient(map.SUPABASE_URL, map.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// Stable static path served by the app (public/icons/Logo_fruver.PNG).
// Case-sensitive on Linux/production, so keep the exact filename casing.
const FRUVER_PATTY_LOGO_URL = "/icons/Logo_fruver.PNG";

// 1. Resolve the fruver vertical.
const { data: vertical, error: vErr } = await supabase
  .from("verticals")
  .select("id, whatsapp_templates_default")
  .eq("slug", "fruver")
  .single();
if (vErr || !vertical) {
  console.error("Fruver vertical not found. Run the consolidated migration first.", vErr?.message);
  process.exit(1);
}

// 2. Upsert the business.
const { data: existing } = await supabase
  .from("businesses")
  .select("id")
  .eq("slug", "fruver-patty")
  .maybeSingle();

let businessId;
if (existing) {
  businessId = existing.id;
  await supabase
    .from("businesses")
    .update({
      vertical_id: vertical.id,
      color: "#8DC63F",
      logo_url: FRUVER_PATTY_LOGO_URL,
      whatsapp_templates_config: vertical.whatsapp_templates_default,
      promotions_config: {
        enabled: true,
        social_invite: "Síguenos en Instagram @fruverpatty",
        whatsapp_broadcast_invite: null
      }
    })
    .eq("id", businessId);
  console.log("Updated existing business fruver-patty:", businessId);
} else {
  const { data: created, error: bErr } = await supabase
    .from("businesses")
    .insert({
      slug: "fruver-patty",
      name: "Fruver Patty",
      color: "#8DC63F",
      logo_url: FRUVER_PATTY_LOGO_URL,
      vertical_id: vertical.id,
      whatsapp_templates_config: vertical.whatsapp_templates_default,
      promotions_config: {
        enabled: true,
        social_invite: "Síguenos en Instagram @fruverpatty",
        whatsapp_broadcast_invite: null
      }
    })
    .select("id")
    .single();
  if (bErr) {
    console.error("Failed to create business:", bErr.message);
    process.exit(1);
  }
  businessId = created.id;
  console.log("Created business fruver-patty:", businessId);
}

// 3. Insert products (only if none exist for this business).
const { data: prods } = await supabase
  .from("products")
  .select("id")
  .eq("business_id", businessId)
  .limit(1);

if (!prods || prods.length === 0) {
  const { error: pErr } = await supabase.from("products").insert([
    { business_id: businessId, name: "Tomate", unit: "kg", day_price: 4500, is_seasonal: false, active: true },
    { business_id: businessId, name: "Mango de temporada", unit: "kg", day_price: 6000, is_seasonal: true, active: true },
    { business_id: businessId, name: "Aguacate", unit: "unidad", day_price: 2500, is_seasonal: false, active: true },
    { business_id: businessId, name: "Banano", unit: "libra", day_price: 1800, is_seasonal: false, active: true }
  ]);
  if (pErr) console.error("Products insert error:", pErr.message);
  else console.log("Inserted 4 products.");
} else {
  console.log("Products already exist, skipping.");
}

// 4. Insert an active banner promotion (only if none active).
const { data: promos } = await supabase
  .from("promotions")
  .select("id")
  .eq("business_id", businessId)
  .eq("active", true)
  .limit(1);

if (!promos || promos.length === 0) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString();
  const { error: prErr } = await supabase.from("promotions").insert({
    business_id: businessId,
    type: "banner",
    text: "¡Hoy 2x1 en mango de temporada!",
    starts_at: yesterday,
    ends_at: nextWeek,
    active: true
  });
  if (prErr) console.error("Promotion insert error:", prErr.message);
  else console.log("Inserted 1 active promotion.");
} else {
  console.log("Active promotion already exists, skipping.");
}

console.log("\nDone. Visit: http://localhost:3000/fruver/fruver-patty");
