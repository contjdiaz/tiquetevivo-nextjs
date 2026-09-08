import { json, parseBody, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import { validatePhone } from "@/lib/api/_validators";
import { getVerticalBySlug, applyVerticalDefaults } from "@/lib/api/_vertical-config";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const VALID_UNITS = ["per_item", "per_kg", "per_hour", "flat_rate"];

function findServiceIndex(services: any[], identifier: any): { idx: number; error?: string } {
  if (identifier.index != null) {
    const idx = Number(identifier.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= services.length) {
      return { idx: -1, error: `Service at index ${identifier.index} not found` };
    }
    return { idx };
  }
  if (identifier.name) {
    const idx = services.findIndex(
      (s) => s.name && s.name.toLowerCase() === identifier.name.toLowerCase()
    );
    if (idx === -1) {
      return { idx: -1, error: `Service '${identifier.name}' not found` };
    }
    return { idx };
  }
  return { idx: -1, error: "Must provide 'index' or 'name' to identify the service" };
}

async function handleAddService(supabase: any, business: any, body: any): Promise<NetlifyResponse> {
  const { service } = body;

  if (!service || typeof service !== "object") {
    return json(400, { error: true, message: "service object is required" });
  }

  if (!service.name || typeof service.name !== "string" || !service.name.trim()) {
    return json(400, { error: true, message: "service.name is required", field: "name" });
  }
  if (service.default_price == null || typeof service.default_price !== "number") {
    return json(400, { error: true, message: "service.default_price is required and must be a number", field: "default_price" });
  }
  if (!service.unit || !VALID_UNITS.includes(service.unit)) {
    return json(400, { error: true, message: `service.unit is required and must be one of: ${VALID_UNITS.join(", ")}`, field: "unit" });
  }

  const newService = {
    name: service.name.trim(),
    description: service.description || "",
    default_price: service.default_price,
    duration: service.duration || 0,
    unit: service.unit,
    active: true
  };

  const updatedServices = [...(business.services_config || []), newService];

  const { data, error } = await supabase
    .from("businesses")
    .update({ services_config: updatedServices })
    .eq("id", business.id)
    .select("services_config")
    .single();

  if (error) throw error;
  return json(200, { services_config: data.services_config });
}

async function handleUpdateService(supabase: any, business: any, body: any): Promise<NetlifyResponse> {
  const { service, index, name } = body;

  if (!service || typeof service !== "object") {
    return json(400, { error: true, message: "service object with fields to update is required" });
  }

  const services = [...(business.services_config || [])];
  const { idx, error: findError } = findServiceIndex(services, { index, name });

  if (idx === -1) {
    return json(404, { error: true, message: findError });
  }

  const allowedFields = ["name", "description", "default_price", "duration", "unit", "active"];
  const fieldsToUpdate = Object.keys(service).filter((k) => allowedFields.includes(k));

  if (fieldsToUpdate.length === 0) {
    return json(400, { error: true, message: "No fields provided to update" });
  }

  if (service.unit !== undefined && !VALID_UNITS.includes(service.unit)) {
    return json(400, { error: true, message: `service.unit must be one of: ${VALID_UNITS.join(", ")}`, field: "unit" });
  }
  if (service.default_price !== undefined && typeof service.default_price !== "number") {
    return json(400, { error: true, message: "service.default_price must be a number", field: "default_price" });
  }
  if (service.name !== undefined && (typeof service.name !== "string" || !service.name.trim())) {
    return json(400, { error: true, message: "service.name must be a non-empty string", field: "name" });
  }

  for (const field of fieldsToUpdate) {
    services[idx] = { ...services[idx], [field]: field === "name" ? service[field].trim() : service[field] };
  }

  const { data, error } = await supabase
    .from("businesses")
    .update({ services_config: services })
    .eq("id", business.id)
    .select("services_config")
    .single();

  if (error) throw error;
  return json(200, { services_config: data.services_config });
}

async function handleUpdateLoyaltyConfig(supabase: any, business: any, body: any): Promise<NetlifyResponse> {
  const { enabled, target } = body;

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return json(400, { error: true, message: "enabled must be a boolean", field: "enabled" });
  }

  if (target !== undefined) {
    if (!Number.isInteger(target) || target < 1 || target > 20) {
      return json(400, { error: true, message: "target must be an integer between 1 and 20", field: "target" });
    }
  }

  if (enabled === undefined && target === undefined) {
    return json(400, { error: true, message: "At least one of 'enabled' or 'target' must be provided" });
  }

  const currentConfig = business.loyalty_config || { enabled: true, target: 5 };
  const updatedConfig = {
    ...currentConfig,
    ...(enabled !== undefined && { enabled }),
    ...(target !== undefined && { target })
  };

  const { data, error } = await supabase
    .from("businesses")
    .update({ loyalty_config: updatedConfig })
    .eq("id", business.id)
    .select("loyalty_config")
    .single();

  if (error) throw error;
  return json(200, { loyalty_config: data.loyalty_config });
}

async function handleUpdateReactivationConfig(supabase: any, business: any, body: any): Promise<NetlifyResponse> {
  const { enabled, threshold_days, monthly_limit } = body;

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return json(400, { error: true, message: "enabled must be a boolean", field: "enabled" });
  }

  if (threshold_days !== undefined) {
    if (!Number.isInteger(threshold_days) || threshold_days < 7 || threshold_days > 90) {
      return json(400, { error: true, message: "threshold_days must be an integer between 7 and 90", field: "threshold_days" });
    }
  }

  if (monthly_limit !== undefined) {
    if (!Number.isInteger(monthly_limit) || monthly_limit <= 0) {
      return json(400, { error: true, message: "monthly_limit must be an integer greater than 0", field: "monthly_limit" });
    }
  }

  if (enabled === undefined && threshold_days === undefined && monthly_limit === undefined) {
    return json(400, { error: true, message: "At least one of 'enabled', 'threshold_days', or 'monthly_limit' must be provided" });
  }

  const currentConfig = business.reactivation_config || { enabled: true, threshold_days: 30, monthly_limit: 50 };
  const updatedConfig = {
    ...currentConfig,
    ...(enabled !== undefined && { enabled }),
    ...(threshold_days !== undefined && { threshold_days }),
    ...(monthly_limit !== undefined && { monthly_limit })
  };

  const { data, error } = await supabase
    .from("businesses")
    .update({ reactivation_config: updatedConfig })
    .eq("id", business.id)
    .select("reactivation_config")
    .single();

  if (error) throw error;
  return json(200, { reactivation_config: data.reactivation_config });
}

async function handleDisableService(supabase: any, business: any, body: any): Promise<NetlifyResponse> {
  const { index, name } = body;

  const services = [...(business.services_config || [])];
  const { idx, error: findError } = findServiceIndex(services, { index, name });

  if (idx === -1) {
    return json(404, { error: true, message: findError });
  }

  services[idx] = { ...services[idx], active: false };

  const { data, error } = await supabase
    .from("businesses")
    .update({ services_config: services })
    .eq("id", business.id)
    .select("services_config")
    .single();

  if (error) throw error;
  return json(200, { services_config: data.services_config });
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = supabaseAdmin();

    const body = parseBody(event);
    const { action, business_id, phone } = body;

    const validActions = [
      "register", "deactivate", "reactivate",
      "add-service", "update-service", "disable-service",
      "update-loyalty-config", "update-reactivation-config"
    ];

    if (!action || !validActions.includes(action)) {
      return json(400, { error: true, message: `action must be one of: ${validActions.join(", ")}` });
    }

    if (action !== "register" && !business_id) {
      return json(400, { error: true, message: "business_id is required" });
    }

    if (action !== "register") {
      const authResult = await requireAuth(supabase, event, {
        permission: "manage_business",
        businessId: business_id
      });
      if (authResult.error) return authResult.error;
    } else {
      const authResult = await requireAuth(supabase, event);
      if (authResult.error) return authResult.error;
    }

    if (phone != null && phone !== "") {
      const phoneResult = validatePhone(phone);
      if (!phoneResult.valid) {
        return json(400, { error: true, message: phoneResult.error, field: "phone" });
      }
    }

    if (action === "register") {
      const { vertical_slug, name, slug: businessSlug } = body;

      if (!vertical_slug) {
        return json(400, { error: true, message: "vertical_slug is required" });
      }

      const vertical = await getVerticalBySlug(supabase, vertical_slug);
      if (!vertical) {
        return json(400, { error: true, message: `Vertical '${vertical_slug}' not found`, field: "vertical_slug" });
      }

      const { data: newBusiness, error: insertError } = await supabase
        .from("businesses")
        .insert({
          name: name || null,
          slug: businessSlug || null,
          phone: phone || null,
          vertical_id: vertical.id,
          active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await applyVerticalDefaults(supabase, newBusiness.id, vertical);

      const { data: updatedBusiness, error: fetchUpdatedError } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", newBusiness.id)
        .single();

      if (fetchUpdatedError) throw fetchUpdatedError;
      return json(201, updatedBusiness);
    }

    const { data: business, error: fetchError } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business_id)
      .single();

    if (fetchError || !business) {
      return json(404, { error: true, message: "Business not found" });
    }

    if (action === "add-service") {
      return await handleAddService(supabase, business, body);
    }

    if (action === "update-service") {
      return await handleUpdateService(supabase, business, body);
    }

    if (action === "disable-service") {
      return await handleDisableService(supabase, business, body);
    }

    if (action === "update-loyalty-config") {
      return await handleUpdateLoyaltyConfig(supabase, business, body);
    }

    if (action === "update-reactivation-config") {
      return await handleUpdateReactivationConfig(supabase, business, body);
    }

    if (action === "deactivate") {
      if (business.active === false) {
        return json(400, { error: true, message: "Business is already deactivated" });
      }

      const { data, error } = await supabase
        .from("businesses")
        .update({ active: false, deactivated_at: new Date().toISOString() })
        .eq("id", business_id)
        .select()
        .single();

      if (error) throw error;
      return json(200, data);
    }

    if (action === "reactivate") {
      if (business.active === true) {
        return json(400, { error: true, message: "Business is already active" });
      }

      const { data, error } = await supabase
        .from("businesses")
        .update({ active: true, deactivated_at: null })
        .eq("id", business_id)
        .select()
        .single();

      if (error) throw error;
      return json(200, data);
    }
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
