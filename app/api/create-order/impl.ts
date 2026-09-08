import { randomUUID } from "crypto";
import { getBusinessBySlug, getClientIp, json, parseBody, requireAuth, supabaseAdmin } from "@/lib/api/_utils";
import { mirrorOrderToSheets } from "@/lib/api/_sheets";
import { validatePhone, validateAmount, validateRequired, validateCustomFields, validateStatusInFlow } from "@/lib/api/_validators";
import { sendWhatsAppMessage, buildFallbackLink, logWhatsAppMessage } from "@/lib/api/_whatsapp";
import { getBusinessConfig } from "@/lib/api/_vertical-config";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import { validatePhoto, uploadPhoto } from "@/lib/api/_photo-storage";
import { upsertCustomer } from "@/lib/api/_customers";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

function normalizeOrderItems(items: any[], businessId: string): any[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalized: any[] = [];
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice || item.unit_price);
    if (!item.itemType && !item.item_type && !item.description) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    normalized.push({
      business_id: businessId,
      item_type: item.itemType || item.item_type || "prenda",
      description: item.description || "",
      quantity,
      unit_price: unitPrice,
      status: ["OK", "DAMAGED", "MISSING", "STAINED"].includes(item.status) ? item.status : "OK"
    });
  }
  return normalized.length > 0 ? normalized : null;
}

function buildItemsText(items: any[]) {
  if (!items || items.length === 0) return "";
  return items
    .map((i) => `${i.quantity}x ${i.item_type}${i.description ? ` (${i.description})` : ""}`)
    .join(", ");
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);

    const hasBusinessId = body.businessSlug || body.slug || body.business_id;
    if (!hasBusinessId) {
      return json(400, { error: true, message: "business_id or slug is required", field: "businessSlug" });
    }

    const requiredCheck = validateRequired(body, ["customerName", "customerPhone", "itemsText"]);
    if (!requiredCheck.valid) {
      return json(400, { error: true, message: requiredCheck.errors?.join("; ") });
    }

    const phoneResult = validatePhone(body.customerPhone);
    if (!phoneResult.valid) {
      return json(400, { error: true, message: phoneResult.error, field: "customer_phone" });
    }

    if (body.total != null) {
      const totalResult = validateAmount(body.total, "total");
      if (!totalResult.valid) {
        return json(400, { error: true, message: totalResult.error, field: "total" });
      }
    }

    if (body.paid != null) {
      const paidResult = validateAmount(body.paid, "paid");
      if (!paidResult.valid) {
        return json(400, { error: true, message: paidResult.error, field: "paid" });
      }
    }

    if (body.intakePhoto != null) {
      const photoValidation = validatePhoto(body.intakePhoto);
      if (!photoValidation.valid) {
        return json(400, { error: true, message: photoValidation.error, field: "intakePhoto" });
      }
    }

    const supabase = supabaseAdmin();
    const slug = body.businessSlug || body.slug || "majesty";

    let business: any;
    if (body.business_id) {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", body.business_id)
        .single();
      if (bizError) throw bizError;
      business = bizData;
    } else {
      business = await getBusinessBySlug(supabase, slug);
    }

    const authResult = await requireAuth(supabase, event, {
      permission: "create_order",
      businessId: business.id
    });
    if (authResult.error) return authResult.error;

    if (business.active === false) {
      return json(403, { error: true, message: "Business is deactivated. Cannot create orders." });
    }

    const isPaid = business.plan === "paid";
    if (!isPaid && body.intakePhoto) {
      return json(403, { error: true, message: "Photo evidence requires a paid plan." });
    }
    if (!isPaid && (body.intakeConfirmed === true || body.intakeConfirmed === "true")) {
      return json(403, { error: true, message: "Digital confirmation requires a paid plan." });
    }

    const businessConfig = await getBusinessConfig(supabase, business.id);

    let customFields: Record<string, any> = body.custom_fields || body.customFields || {};

    if (body.is_delicate !== undefined || body.isDelicate !== undefined) {
      customFields.is_delicate = body.is_delicate ?? body.isDelicate;
    }
    if (body.rack_location !== undefined || body.rackLocation !== undefined) {
      customFields.rack_location = body.rack_location ?? body.rackLocation;
    }

    const customFieldsDefs = businessConfig.custom_fields_config || [];
    if (customFieldsDefs.length > 0 || Object.keys(customFields).length > 0) {
      const cfResult = validateCustomFields(customFields, customFieldsDefs);
      if (!cfResult.valid) {
        return json(400, { error: true, message: cfResult.errors?.join("; ") });
      }
    }

    const statusFlow = businessConfig.status_flow_config || [];
    let resolvedStatus = body.status;

    if (!resolvedStatus && statusFlow.length > 0) {
      resolvedStatus = statusFlow[0].status_key;
    } else if (!resolvedStatus) {
      resolvedStatus = "RECEIVED";
    }

    if (statusFlow.length > 0) {
      const statusResult = validateStatusInFlow(resolvedStatus, statusFlow);
      if (!statusResult.valid) {
        return json(400, { error: true, message: statusResult.error });
      }
      resolvedStatus = statusResult.value;
    }

    const orderNumber = body.orderNumber || String(Date.now()).slice(-6);

    const ticket_token = randomUUID();

    let customerId: string | null = null;
    try {
      const result = await upsertCustomer(supabase, {
        businessId: business.id,
        name: body.customerName,
        phone: phoneResult.value,
        address: body.customerAddress || body.address || null
      });
      customerId = result.id;
    } catch (custErr: any) {
      console.error("[create-order] customer link error:", custErr.message);
    }

    const payload: Record<string, any> = {
      business_id: business.id,
      order_number: orderNumber,
      customer_name: body.customerName,
      customer_phone: phoneResult.value,
      items_text: body.itemsText,
      total: Number(body.total || 0),
      paid: Number(body.paid || 0),
      status: resolvedStatus,
      custom_fields: customFields,
      ticket_token
    };

    if (customerId) payload.customer_id = customerId;

    if (body.dueDate) payload.due_date = body.dueDate;

    if (body.intakePhoto) {
      const mimeMatch = body.intakePhoto.match(/^data:image\/([^;]+);base64,/);
      const ext = mimeMatch ? mimeMatch[1].replace("jpeg", "jpg") : "jpg";
      const tempOrderId = randomUUID();
      const storagePath = `${business.id}/${tempOrderId}/intake.${ext}`;

      try {
        const uploadResult = await uploadPhoto(supabase, body.intakePhoto, storagePath);
        payload.intake_photo_url = uploadResult.path;
        payload.intake_photo_taken_at = new Date().toISOString();
      } catch (uploadError) {
        return json(500, { error: true, message: "Photo upload failed" });
      }
    }

    if (body.intakeConfirmed === true || body.intakeConfirmed === "true") {
      payload.intake_confirmed_at = new Date().toISOString();
      payload.intake_confirmed_ip = getClientIp(event);
    }

    let orderItems: any[] | null = null;
    if (isPaid && body.items) {
      orderItems = normalizeOrderItems(body.items, business.id);
      if (orderItems) {
        payload.items_text = buildItemsText(orderItems);
      }
    }

    const { data, error } = await supabase
      .from("orders")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    if (orderItems && orderItems.length > 0) {
      const itemsWithOrderId = orderItems.map((item: any) => ({ ...item, order_id: data.id }));
      await supabase.from("order_items").insert(itemsWithOrderId);
    }

    mirrorOrderToSheets(data, business).catch(() => {});

    let whatsappResult: Record<string, any> | null = null;

    try {
      const verticalTemplates = businessConfig.vertical?.whatsapp_templates_default || null;
      const businessTemplates = businessConfig.whatsapp_templates_config || null;

      const template = selectTemplate("order_created", businessTemplates, verticalTemplates);

      const statusEntry = statusFlow.find(
        (entry: any) => entry.status_key.toUpperCase() === resolvedStatus.toUpperCase()
      );
      const statusLabel = statusEntry ? statusEntry.display_label : resolvedStatus;

      const messageText = renderTemplate(
        template,
        {
          customer_name: data.customer_name,
          order_number: data.order_number,
          items_text: data.items_text,
          total: data.total,
          balance: Math.max(0, Number(data.total || 0) - Number(data.paid || 0)),
          status_label: statusLabel,
          custom_fields: customFields
        },
        {
          name: business.name
        }
      );

      const sendResult = await sendWhatsAppMessage({
        to: phoneResult.value,
        text: messageText
      });

      if (sendResult.success) {
        await supabase
          .from("orders")
          .update({ whatsapp_sent_at: new Date().toISOString() })
          .eq("id", data.id);

        await logWhatsAppMessage(supabase, {
          orderId: data.id,
          businessId: business.id,
          phone: phoneResult.value,
          templateName: null,
          messageBody: messageText,
          metaMessageId: sendResult.messageId || null,
          status: "SENT",
          errorMessage: null
        });

        whatsappResult = { sent: true, messageId: sendResult.messageId };
      } else if (sendResult.dryRun) {
        await logWhatsAppMessage(supabase, {
          orderId: data.id,
          businessId: business.id,
          phone: phoneResult.value,
          templateName: null,
          messageBody: messageText,
          metaMessageId: null,
          status: "DRY_RUN",
          errorMessage: null
        });

        whatsappResult = {
          sent: false,
          dryRun: true,
          fallbackLink: sendResult.fallbackLink || buildFallbackLink(phoneResult.value, messageText)
        };
      } else {
        await logWhatsAppMessage(supabase, {
          orderId: data.id,
          businessId: business.id,
          phone: phoneResult.value,
          templateName: null,
          messageBody: messageText,
          metaMessageId: null,
          status: "FAILED",
          errorMessage: sendResult.error || "Unknown error"
        });

        whatsappResult = {
          sent: false,
          error: sendResult.error,
          fallbackLink: sendResult.fallbackLink || buildFallbackLink(phoneResult.value, messageText)
        };
      }
    } catch (waError: any) {
      console.error("[create-order] WhatsApp send error:", waError.message);
      whatsappResult = {
        sent: false,
        error: waError.message,
        fallbackLink: buildFallbackLink(phoneResult.value, "")
      };
    }

    return json(201, { ...data, whatsapp: whatsappResult });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}
