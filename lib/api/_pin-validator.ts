/**
 * Shared PIN validation and hashing module for TiqueteVivo.
 * Used by registration (registro) and login (auth-pin-login) endpoints.
 */

import bcrypt from "bcryptjs";

const BCRYPT_COST_FACTOR = 10;

export function isValidPIN(pin: any): boolean {
  if (typeof pin !== "string") return false;
  if (pin.length < 4 || pin.length > 6) return false;
  return /^\d+$/.test(pin);
}

export async function hashPIN(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST_FACTOR);
  return bcrypt.hash(pin, salt);
}

export async function verifyPIN(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}