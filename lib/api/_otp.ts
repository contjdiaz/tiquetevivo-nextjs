/**
 * OTP (One-Time Password) shared module for TiqueteVivo.
 * Handles generation, storage, verification, and rate limiting of OTP codes.
 */

import crypto from "crypto";

export function generateOTP(): string {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, "0");
}

export async function storeOTP(
  supabase: any,
  params: any
): Promise<{ success: boolean; error?: string }> {
  const { phone, businessId, code, ttlMinutes = 5 } = params;
  try {
    await supabase
      .from("otp_codes")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("phone", phone)
      .eq("business_id", businessId)
      .is("used_at", null)
      .is("invalidated_at", null);

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { error } = await supabase.from("otp_codes").insert({
      phone,
      business_id: businessId,
      code,
      attempts: 0,
      max_attempts: 3,
      expires_at: expiresAt
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function verifyOTP(
  supabase: any,
  params: any
): Promise<{ valid: boolean; expired?: boolean; locked?: boolean; remainingAttempts?: number; error?: string }> {
  const { phone, businessId, code } = params;
  try {
    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("phone", phone)
      .eq("business_id", businessId)
      .is("invalidated_at", null)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      return { valid: false, error: "no_otp_found" };
    }

    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (expiresAt < now) {
      return { valid: false, expired: true };
    }

    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return { valid: false, locked: true };
    }

    const submittedBuffer = Buffer.from(String(code), "utf8");
    const storedBuffer = Buffer.from(String(otpRecord.code), "utf8");

    const maxLen = Math.max(submittedBuffer.length, storedBuffer.length);
    const paddedSubmitted = Buffer.alloc(maxLen, 0);
    const paddedStored = Buffer.alloc(maxLen, 0);
    submittedBuffer.copy(paddedSubmitted);
    storedBuffer.copy(paddedStored);

    const isMatch = crypto.timingSafeEqual(paddedSubmitted, paddedStored);

    if (isMatch) {
      await supabase
        .from("otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      return { valid: true };
    }

    const newAttempts = otpRecord.attempts + 1;
    await supabase
      .from("otp_codes")
      .update({ attempts: newAttempts })
      .eq("id", otpRecord.id);

    const remainingAttempts = otpRecord.max_attempts - newAttempts;
    return { valid: false, remainingAttempts };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function checkOTPRateLimit(
  supabase: any,
  phone: string,
  businessId: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("otp_codes")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("business_id", businessId)
      .gte("created_at", fifteenMinutesAgo);

    if (error) {
      return { allowed: false, error: error.message };
    }

    if (count >= 3) {
      return { allowed: false };
    }

    return { allowed: true };
  } catch (err: any) {
    return { allowed: false, error: err.message };
  }
}