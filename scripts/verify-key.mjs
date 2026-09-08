// Verify the new SUPABASE_SECRET_KEY works and inspect fruver setup.
import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const map = {};
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) map[m[1]] = m[2].trim();
}
const url = map.SUPABASE_URL;
const key = map.SUPABASE_SECRET_KEY;

async function q(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 400) };
}

console.log("KEY prefix:", key.slice(0, 14));
console.log("verticals(fruver):", JSON.stringify(await q("verticals?select=id,slug&slug=eq.fruver")));
console.log("businesses:", JSON.stringify(await q("businesses?select=id,slug,vertical_id&limit=10")));
console.log("products:", JSON.stringify(await q("products?select=id,name,active&limit=10")));
