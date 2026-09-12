import { json, parseBody, slugify, supabaseAdmin } from "@/lib/api/_utils";
import { mirrorBusinessToSheets } from "@/lib/api/_sheets";
import { validatePhone, validateRequired } from "@/lib/api/_validators";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);

    const requiredCheck = validateRequired(body, ["name"]);
    if (!requiredCheck.valid) {
      return json(400, { success: false, error: true, message: requiredCheck.errors.join("; "), field: "name" });
    }

    const slug = slugify(body.slug || body.name);
    if (!slug) {
      return json(400, { success: false, error: true, message: "A valid slug could not be generated. Provide a valid 'slug' or 'name' containing alphanumeric characters.", field: "slug" });
    }

    if (body.phone) {
      const phoneResult = validatePhone(body.phone);
      if (!phoneResult.valid) {
        return json(400, { success: false, error: true, message: phoneResult.error, field: "phone" });
      }
    }

    const supabase = supabaseAdmin();
    const payload = {
      slug,
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      color: body.color || "#18a058",
      logo_url: body.logoUrl || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("businesses")
      .upsert(payload, { onConflict: "slug" })
      .select()
      .single();

    if (error) throw error;
    mirrorBusinessToSheets(data).catch(() => {});
    return json(200, { success: true, business: data });
  } catch (error: any) {
    return json(500, { success: false, error: error.message });
  }
}

export const POST = netlifyHandler(handler);