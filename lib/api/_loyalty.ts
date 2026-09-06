/**
 * Shared Loyalty Module for TiqueteVivo.
 * Handles loyalty stamp accumulation, reversion, reward redemption, and summary retrieval.
 */

import { validatePhone } from "./_validators";

export async function getOrCreateLoyaltyProfile(
  supabase: any,
  phone: string
): Promise<{ success: boolean; profile?: any; error?: string }> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return { success: false, error: phoneResult.error };
  }

  const normalizedPhone = phoneResult.value;

  const { data: existing, error: fetchError } = await supabase
    .from("customer_loyalty")
    .select("*")
    .eq("phone_number", normalizedPhone)
    .single();

  if (existing) {
    return { success: true, profile: existing };
  }

  if (fetchError && fetchError.code !== "PGRST116") {
    return { success: false, error: fetchError.message };
  }

  const { data: created, error: insertError } = await supabase
    .from("customer_loyalty")
    .insert({ phone_number: normalizedPhone })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced, error: racedError } = await supabase
        .from("customer_loyalty")
        .select("*")
        .eq("phone_number", normalizedPhone)
        .single();

      if (racedError) {
        return { success: false, error: racedError.message };
      }
      return { success: true, profile: raced };
    }
    return { success: false, error: insertError.message };
  }

  return { success: true, profile: created };
}

export async function addStamp(
  supabase: any,
  loyaltyId: string,
  orderId: string,
  businessId: string
): Promise<{ success: boolean; stamps_count?: number; reward_unlocked?: boolean; already_stamped?: boolean; error?: string }> {
  const { error: insertError } = await supabase
    .from("loyalty_events")
    .insert({
      loyalty_id: loyaltyId,
      order_id: orderId,
      event_type: "STAMP"
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: true, already_stamped: true };
    }
    return { success: false, error: insertError.message };
  }

  const { data: profile, error: fetchError } = await supabase
    .from("customer_loyalty")
    .select("total_stamps, available_rewards")
    .eq("id", loyaltyId)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  const newStamps = profile.total_stamps + 1;

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("loyalty_config")
    .eq("id", businessId)
    .single();

  if (bizError) {
    return { success: false, error: bizError.message };
  }

  const target = business.loyalty_config?.target || 5;
  const rewardUnlocked = newStamps >= target && newStamps % target === 0;

  const updatePayload: Record<string, any> = {
    total_stamps: newStamps,
    last_stamp_at: new Date().toISOString()
  };

  if (rewardUnlocked) {
    updatePayload.available_rewards = profile.available_rewards + 1;
  }

  const { error: saveError } = await supabase
    .from("customer_loyalty")
    .update(updatePayload)
    .eq("id", loyaltyId);

  if (saveError) {
    return { success: false, error: saveError.message };
  }

  return {
    success: true,
    stamps_count: newStamps,
    reward_unlocked: rewardUnlocked,
    already_stamped: false
  };
}

export async function revertStamp(
  supabase: any,
  loyaltyId: string,
  orderId: string
): Promise<{ success: boolean; reverted?: boolean; stamps_count?: number; error?: string }> {
  const { data: stampEvent, error: fetchError } = await supabase
    .from("loyalty_events")
    .select("id")
    .eq("loyalty_id", loyaltyId)
    .eq("order_id", orderId)
    .eq("event_type", "STAMP")
    .single();

  if (fetchError || !stampEvent) {
    return { success: true, reverted: false };
  }

  const { error: insertError } = await supabase
    .from("loyalty_events")
    .insert({
      loyalty_id: loyaltyId,
      order_id: orderId,
      event_type: "REVERT"
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  const { data: profile, error: profileError } = await supabase
    .from("customer_loyalty")
    .select("total_stamps")
    .eq("id", loyaltyId)
    .single();

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  const newStamps = Math.max(0, profile.total_stamps - 1);

  const { error: updateError } = await supabase
    .from("customer_loyalty")
    .update({ total_stamps: newStamps })
    .eq("id", loyaltyId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, reverted: true, stamps_count: newStamps };
}

export async function redeemReward(
  supabase: any,
  loyaltyId: string,
  orderId: string,
  operatorUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: profile, error: fetchError } = await supabase
    .from("customer_loyalty")
    .select("available_rewards, total_stamps")
    .eq("id", loyaltyId)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  if (!profile || profile.available_rewards <= 0) {
    return { success: false, error: "No rewards available to redeem" };
  }

  const { error: insertError } = await supabase
    .from("loyalty_events")
    .insert({
      loyalty_id: loyaltyId,
      order_id: orderId,
      event_type: "REDEEM"
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  const { error: updateError } = await supabase
    .from("customer_loyalty")
    .update({
      available_rewards: profile.available_rewards - 1,
      total_stamps: 0
    })
    .eq("id", loyaltyId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

export async function getLoyaltySummary(
  supabase: any,
  phone: string,
  businessId: string
): Promise<{
  success: boolean;
  summary?: { stamps_count: number; stamps_target: number; reward_available: boolean };
  error?: string;
}> {
  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return { success: false, error: phoneResult.error };
  }

  const normalizedPhone = phoneResult.value;

  const { data: profile, error: profileError } = await supabase
    .from("customer_loyalty")
    .select("total_stamps, available_rewards")
    .eq("phone_number", normalizedPhone)
    .single();

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("loyalty_config")
    .eq("id", businessId)
    .single();

  if (bizError) {
    return { success: false, error: bizError.message };
  }

  const target = business.loyalty_config?.target || 5;

  if (profileError || !profile) {
    return {
      success: true,
      summary: {
        stamps_count: 0,
        stamps_target: target,
        reward_available: false
      }
    };
  }

  return {
    success: true,
    summary: {
      stamps_count: profile.total_stamps,
      stamps_target: target,
      reward_available: profile.available_rewards > 0
    }
  };
}