/**
 * Shared Vertical Configuration Module for TiqueteVivo Multi-Vertical Platform.
 */

export async function getBusinessConfig(supabase: any, businessId: string): Promise<any> {
  const { data, error } = await supabase
    .from("businesses")
    .select(`
      id,
      slug,
      name,
      color,
      vertical_id,
      services_config,
      custom_fields_config,
      status_flow_config,
      whatsapp_templates_config,
      verticals (
        id,
        slug,
        name,
        emoji,
        services_default,
        custom_fields_default,
        status_flow_default,
        whatsapp_templates_default
      )
    `)
    .eq("id", businessId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Business not found");

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    color: data.color || null,
    vertical_id: data.vertical_id,
    services_config: data.services_config || [],
    custom_fields_config: data.custom_fields_config || [],
    status_flow_config: data.status_flow_config || [],
    whatsapp_templates_config: data.whatsapp_templates_config || {},
    vertical: data.verticals || null
  };
}

export async function getVerticalBySlug(supabase: any, slug: string): Promise<any> {
  const { data, error } = await supabase
    .from("verticals")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .single();

  if (error && error.code === "PGRST116") {
    return null;
  }
  if (error) throw error;

  return data;
}

export async function applyVerticalDefaults(
  supabase: any,
  businessId: string,
  vertical: any
): Promise<void> {
  const { error } = await supabase
    .from("businesses")
    .update({
      vertical_id: vertical.id,
      services_config: vertical.services_default || [],
      custom_fields_config: vertical.custom_fields_default || [],
      status_flow_config: vertical.status_flow_default || [],
      whatsapp_templates_config: vertical.whatsapp_templates_default || {}
    })
    .eq("id", businessId);

  if (error) throw error;
}