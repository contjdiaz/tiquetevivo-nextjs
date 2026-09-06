/**
 * Seed script: creates demo businesses and operator users for local testing.
 *
 * Usage:
 *   node scripts/seed-demo-data.js
 *
 * Or with custom env file:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-data.js
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0 && !process.env[key.trim()]) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env not found, rely on environment variables
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error("❌ Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  console.error("Create a .env file or set the environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// Mirror of supabase/migrations/014_add_domicilios_vertical.sql so local dev
// works without SQL Editor access. Migration stays canonical for production.
const DOMICILIOS_VERTICAL = {
  slug: "domicilios",
  name: "Domicilios",
  emoji: "🛵",
  services_default: [
    { name: "Canasta familiar", description: "Selección semanal de frutas y verduras", default_price: 50000, duration: 60, unit: "flat_rate" },
    { name: "Frutas por kilo", description: "Frutas surtidas de temporada", default_price: 8000, duration: 30, unit: "per_kg" },
    { name: "Verduras por kilo", description: "Verduras frescas surtidas", default_price: 6000, duration: 30, unit: "per_kg" },
    { name: "Domicilio", description: "Costo de envío a domicilio", default_price: 5000, duration: 45, unit: "flat_rate" }
  ],
  custom_fields_default: [
    { field_key: "orden_entrega", display_label: "Orden de entrega", field_type: "text", required: true, default_value: null },
    { field_key: "fecha", display_label: "Fecha de entrega", field_type: "date", required: true, default_value: null },
    { field_key: "hora", display_label: "Hora de entrega", field_type: "time", required: true, default_value: null },
    { field_key: "productos", display_label: "Productos", field_type: "textarea", required: true, default_value: null },
    { field_key: "monto", display_label: "Monto", field_type: "number", required: false, default_value: null },
    { field_key: "forma_pago", display_label: "Forma de pago", field_type: "select", required: true, default_value: "Efectivo", options: ["Efectivo", "Nequi", "Daviplata", "Transferencia", "Datáfono", "Addí"] }
  ],
  status_flow_default: [
    { status_key: "ORDERED", display_label: "Ordenado" },
    { status_key: "IN_PREPARATION", display_label: "En preparación" },
    { status_key: "ON_THE_WAY", display_label: "En camino" },
    { status_key: "DELIVERED", display_label: "Entregado" }
  ],
  whatsapp_templates_default: {
    order_created: "🛵 *{business_name}*\n\nHola {customer_name} 👋\nTu orden de entrega *{custom.orden_entrega}* ha sido registrada.\n\n🛒 Productos:\n{custom.productos}\n\n📅 Entrega: {custom.fecha} a las {custom.hora}\n💰 Monto: {custom.monto}\nTotal: {total}\n💳 Forma de pago: {custom.forma_pago}\n\n¡Gracias por tu compra!",
    status_ready: "🛵 *{business_name}*\n\nHola {customer_name}, tu orden *{custom.orden_entrega}* VA EN CAMINO.\n\nTotal: {total}\nSaldo pendiente: {balance}\n\n¡Ten lista tu canasta! 🍓🥦",
    status_delivered: "✅ *{business_name}*\n\nHola {customer_name}, tu orden *{custom.orden_entrega}* fue entregada.\n\n¡Gracias por preferirnos! 🍓🥦"
  }
};

async function upsertVertical(vertical) {
  const { error } = await supabase
    .from("verticals")
    .upsert(vertical, { onConflict: "slug" });
  if (error) throw new Error(`Failed to upsert vertical ${vertical.slug}: ${error.message}`);
  console.log(`✅ Vertical: ${vertical.name} (${vertical.slug}) ${vertical.emoji}`);
}

async function upsertBusiness({ slug, name, plan, verticalSlug, color }) {
  const payload = {
    slug,
    name,
    phone: "+573001234567",
    address: "Calle 50 #21-15",
    city: "Medellin",
    color: color || "#18a058",
    plan
  };

  // Resolve vertical (if any) to attach the business to it
  if (verticalSlug) {
    const { data: vertical, error: vError } = await supabase
      .from("verticals")
      .select("*")
      .eq("slug", verticalSlug)
      .single();
    if (vError || !vertical) {
      throw new Error(`Vertical '${verticalSlug}' not found. Run migration 003/014 first.`);
    }
    payload.vertical_id = vertical.id;
    // Keep the domicilios lime accent unless a specific color was provided
    if (!color) payload.color = "#84cc16";
  }

  const { data, error } = await supabase
    .from("businesses")
    .upsert(payload, { onConflict: "slug" })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert business ${slug}: ${error.message}`);
  console.log(`✅ Business: ${data.name} (${data.slug}) — plan: ${data.plan}`);

  // Apply vertical defaults (services, custom fields, status flow, templates)
  if (verticalSlug) {
    const { data: vertical } = await supabase
      .from("verticals")
      .select("*")
      .eq("slug", verticalSlug)
      .single();

    const { error: defError } = await supabase
      .from("businesses")
      .update({
        services_config: vertical.services_default || [],
        custom_fields_config: vertical.custom_fields_default || [],
        status_flow_config: vertical.status_flow_default || [],
        whatsapp_templates_config: vertical.whatsapp_templates_default || {}
      })
      .eq("id", data.id);

    if (defError) throw new Error(`Failed to apply vertical defaults: ${defError.message}`);
    console.log(`   ↳ Vertical defaults applied (${verticalSlug})`);
  }

  return data;
}

// Demo businesses, one per seeded vertical, so every link in the
// business-playbook.md resolves to a working ticket. Slugs match the playbook.
// Each vertical relies on its verticals row (seeded via migration 003) for
// services/status flow. We only need slug + name + verticalSlug here.
const VERTICAL_DEMO_BUSINESSES = [
  { slug: "demo-laundry", name: "Lavandería Demo", verticalSlug: "laundry", color: "#0ea5e9" },
  { slug: "demo-mechanic", name: "Taller Demo", verticalSlug: "mechanic", color: "#f97316" },
  { slug: "demo-shoe-repair", name: "Reparación Calzado Demo", verticalSlug: "shoe-repair", color: "#92400e" },
  { slug: "demo-bakery", name: "Pastelería Demo", verticalSlug: "bakery", color: "#ec4899" },
  { slug: "demo-tailor", name: "Sastrería Demo", verticalSlug: "tailor", color: "#7c3aed" },
  { slug: "demo-pet-daycare", name: "Guardería Mascotas Demo", verticalSlug: "pet-daycare", color: "#16a34a" },
  { slug: "demo-courier", name: "Mensajería Demo", verticalSlug: "courier", color: "#0891b2" },
  { slug: "demo-print-center", name: "Impresión Demo", verticalSlug: "print-center", color: "#334155" },
  { slug: "demo-salon", name: "Salón Belleza Demo", verticalSlug: "salon", color: "#db2777" },
  { slug: "demo-gym-locker", name: "Casilleros Demo", verticalSlug: "gym-locker", color: "#475569" },
  { slug: "demo-nursery", name: "Vivero Demo", verticalSlug: "nursery", color: "#65a30d" },
  { slug: "demo-parking", name: "Parqueadero Demo", verticalSlug: "parking", color: "#1e40af" }
];

// Shared demo direct-transfer payment details (task 9: payment_config).
const DEMO_PAYMENT_CONFIG = {
  nequi: "300 111 2233",
  daviplata: "300 111 2233",
  bancolombia: "555-666777-88",
  account_holder: "Negocio Demo TiqueteVivo"
};

/**
 * Sets payment_config on a business (task 9 demo).
 */
async function setPaymentConfig(business, paymentConfig) {
  const { error } = await supabase
    .from("businesses")
    .update({ payment_config: paymentConfig })
    .eq("id", business.id);
  if (error) {
    // Column may not exist yet if migration 031 hasn't run — warn, don't fail.
    console.warn(`   ⚠️ Could not set payment_config for ${business.slug}: ${error.message}`);
    return;
  }
  console.log(`   ↳ payment_config applied`);
}

/**
 * Creates a set of demo orders for a business so its ticket links tell a story:
 * one at the first status, one mid-flow, one ready with balance, one delivered.
 * order_number values are deterministic per business for stable playbook links.
 * Idempotent via upsert on (business_id, order_number).
 */
async function seedOrdersForBusiness(business, statusFlow) {
  const flow = (statusFlow && statusFlow.length > 0)
    ? statusFlow.map((s) => s.status_key)
    : ["RECEIVED", "IN_PROGRESS", "READY", "DELIVERED"];

  const first = flow[0];
  const mid = flow[Math.floor(flow.length / 2)] || first;
  const ready = flow[flow.length - 2] || flow[flow.length - 1];
  const last = flow[flow.length - 1];

  const base = [
    { n: "1001", status: first, total: 25000, paid: 0, name: "Cliente Inicial" },
    { n: "1002", status: mid, total: 40000, paid: 10000, name: "Cliente En Proceso" },
    { n: "1003", status: ready, total: 30000, paid: 5000, name: "Cliente Por Recoger" },
    { n: "1004", status: last, total: 20000, paid: 20000, name: "Cliente Entregado" }
  ];

  for (const o of base) {
    const { error } = await supabase
      .from("orders")
      .upsert({
        business_id: business.id,
        order_number: o.n,
        customer_name: o.name,
        customer_phone: "+573001234567",
        items_text: "Servicio demo",
        total: o.total,
        paid: o.paid,
        status: o.status
      }, { onConflict: "business_id,order_number" });
    if (error) {
      console.warn(`   ⚠️ Order ${o.n} for ${business.slug}: ${error.message}`);
    }
  }
  console.log(`   ↳ ${base.length} demo orders (${first} → ${last})`);
}

async function upsertUser({ email, password }) {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);

  if (found) {
    console.log(`⚠️ User already exists: ${email}`);
    return found;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  console.log(`✅ User created: ${email}`);
  return data.user;
}

async function linkUserToBusiness({ user, business, role }) {
  const { data, error } = await supabase
    .from("business_users")
    .upsert({
      auth_user_id: user.id,
      business_id: business.id,
      email: user.email,
      role,
      active: true
    }, { onConflict: "auth_user_id,business_id" })
    .select()
    .single();

  if (error) throw new Error(`Failed to link ${user.email}: ${error.message}`);
  console.log(`✅ Linked ${user.email} to ${business.slug} as ${data.role}`);
}

async function main() {
  console.log("🌱 Seeding demo data...\n");

  // 0. Domicilios vertical (idempotent, mirrors migration 014)
  await upsertVertical(DOMICILIOS_VERTICAL);

  // 1. Free plan business
  const majestyFree = await upsertBusiness({
    slug: "majesty",
    name: "Majesty Lavanderia",
    plan: "free"
  });

  // 2. Paid plan business
  const majestyPaid = await upsertBusiness({
    slug: "majestypremium",
    name: "Majesty Premium",
    plan: "paid"
  });

  // 3. Domicilios vertical business (fruits & vegetables delivery)
  const paty = await upsertBusiness({
    slug: "domiciliospaty",
    name: "Domicilios Paty",
    plan: "free",
    verticalSlug: "domicilios"
  });

  // 4. Operator for free business
  const operatorFree = await upsertUser({
    email: "operador@majesty.com",
    password: "TiqueteVivo2026!"
  });
  await linkUserToBusiness({ user: operatorFree, business: majestyFree, role: "owner" });

  // 5. Operator for paid business
  const operatorPaid = await upsertUser({
    email: "operadorpago@majesty.com",
    password: "TiqueteVivo2026!"
  });
  await linkUserToBusiness({ user: operatorPaid, business: majestyPaid, role: "owner" });

  // 6. Operator for Domicilios Paty
  const operatorPaty = await upsertUser({
    email: "domicilios@paty.com",
    password: "TiqueteVivo2026!"
  });
  await linkUserToBusiness({ user: operatorPaty, business: paty, role: "owner" });

  // 7. Superadmin
  const superadmin = await upsertUser({
    email: "admin@tiquetevivo.com",
    password: "MiClaveSegura123!"
  });
  await linkUserToBusiness({ user: superadmin, business: majestyPaid, role: "superadmin" });

  // 8. payment_config for the core demo businesses (task 9 showcase)
  console.log("\n💳 Applying payment_config to core businesses...");
  await setPaymentConfig(majestyFree, DEMO_PAYMENT_CONFIG);
  await setPaymentConfig(paty, {
    nequi: "301 555 4433",
    daviplata: "301 555 4433",
    account_holder: "Domicilios Paty"
  });

  // 9. Demo orders for core businesses so their playbook links tell a story
  console.log("\n📦 Seeding demo orders for core businesses...");
  await seedOrdersForBusiness(majestyFree);
  await seedOrdersForBusiness(paty, DOMICILIOS_VERTICAL.status_flow_default);

  // 10. One demo business per seeded vertical + demo orders (playbook coverage)
  console.log("\n🏬 Seeding one demo business per vertical...");
  for (const vb of VERTICAL_DEMO_BUSINESSES) {
    try {
      const biz = await upsertBusiness({
        slug: vb.slug,
        name: vb.name,
        plan: "free",
        verticalSlug: vb.verticalSlug,
        color: vb.color
      });
      await setPaymentConfig(biz, DEMO_PAYMENT_CONFIG);

      // Read back the applied status flow to seed coherent orders
      const { data: fresh } = await supabase
        .from("businesses")
        .select("status_flow_config")
        .eq("id", biz.id)
        .single();
      await seedOrdersForBusiness(biz, fresh?.status_flow_config);
    } catch (err) {
      console.warn(`⚠️ Skipped ${vb.slug}: ${err.message}`);
    }
  }

  console.log("\n✅ Demo data ready!");
  console.log("   Links de demo (business-playbook.md) ahora resuelven con order_number 1001–1004.");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
