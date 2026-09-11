// Seed the demo laundry business "maktub" (Maktub Laundry and Care).
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

// Stable static path served by the app (public/icons/Logo_maktub.PNG).
// Case-sensitive on Linux/production, so keep the exact filename casing.
const MAKTUB_LOGO_URL = "/icons/Logo_maktub.PNG";
const MAKTUB_COLOR = "#1f4e8c";
const MAKTUB_PHONE = "+573024711774";

// 1. Resolve the lavanderia vertical.
const { data: vertical, error: vErr } = await supabase
  .from("verticals")
  .select("id, services_default, whatsapp_templates_default")
  .eq("slug", "lavanderia")
  .single();
if (vErr || !vertical) {
  console.error("Lavanderia vertical not found. Run migration 042 first.", vErr?.message);
  process.exit(1);
}

// 2. Upsert the business.
const { data: existing } = await supabase
  .from("businesses")
  .select("id")
  .eq("slug", "maktub")
  .maybeSingle();

let businessId;
const businessPayload = {
  vertical_id: vertical.id,
  color: MAKTUB_COLOR,
  logo_url: MAKTUB_LOGO_URL,
  phone: MAKTUB_PHONE,
  services_config: vertical.services_default,
  whatsapp_templates_config: vertical.whatsapp_templates_default,
  promotions_config: {
    enabled: true,
    social_invite: "Síguenos en Instagram @maktublaundry22",
    whatsapp_broadcast_invite: null
  },
  payment_config: {
    enabled: true,
    providers: ["nequi", "daviplata", "bancolombia"],
    instructions: null,
    account_lines: [
      { provider: "nequi", account: "3102688991", label: "Nequi" },
      { provider: "daviplata", account: "3102688991", label: "Daviplata" }
    ]
  }
};

if (existing) {
  businessId = existing.id;
  const { error: uErr } = await supabase
    .from("businesses")
    .update(businessPayload)
    .eq("id", businessId);
  if (uErr) {
    console.error("Failed to update business:", uErr.message);
    process.exit(1);
  }
  console.log("Updated existing business maktub:", businessId);
} else {
  const { data: created, error: bErr } = await supabase
    .from("businesses")
    .insert({
      slug: "maktub",
      name: "Maktub Laundry and Care",
      address: "Calle 30 #45-12",
      city: "Barranquilla",
      plan: "paid",
      ...businessPayload
    })
    .select("id")
    .single();
  if (bErr) {
    console.error("Failed to create business:", bErr.message);
    process.exit(1);
  }
  businessId = created.id;
  console.log("Created business maktub:", businessId);
}

// 3. Seed services (only if none configured).
if (!existing || !businessPayload.services_config.length) {
  console.log("Business services_config set from vertical defaults.");
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
    text: "¡Recogemos y entregamos tu ropa en 3 horas!",
    starts_at: yesterday,
    ends_at: nextWeek,
    active: true
  });
  if (prErr) console.error("Promotion insert error:", prErr.message);
  else console.log("Inserted 1 active promotion.");
} else {
  console.log("Active promotion already exists, skipping.");
}

console.log("\nDone. Visit: http://localhost:3000/lavanderia/maktub");