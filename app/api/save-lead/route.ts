import { json, parseBody, supabaseAdmin } from "@/lib/api/_utils";
import { postToSheets } from "@/lib/api/_sheets";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    if (!body.business || !body.name || !body.phone) {
      return json(400, { error: "business, name and phone are required" });
    }

    const lead = {
      business: body.business,
      name: body.name,
      phone: body.phone,
      city: body.city || null,
      created_at: new Date().toISOString()
    };

    postToSheets({ type: "lead", lead }).catch(() => {});

    return json(200, { ok: true, lead });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const POST = netlifyHandler(handler);