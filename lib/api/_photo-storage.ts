/**
 * Photo storage module for Supabase Storage.
 * Handles photo validation, upload, and signed URL generation.
 * Bucket: order-photos (private, service-role only access)
 */

const BUCKET_NAME = "order-photos";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const DEFAULT_EXPIRY_SECONDS = 3600;

export function validatePhoto(
  base64DataUrl: string
): { valid: boolean; error?: string; mimeType?: string; sizeBytes?: number } {
  if (!base64DataUrl || typeof base64DataUrl !== "string") {
    return { valid: false, error: "Photo data is required and must be a string" };
  }

  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { valid: false, error: "Invalid photo format. Expected a base64 data URL" };
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: "Unsupported image format. Accepted: JPEG, PNG, GIF, WebP"
    };
  }

  const buffer = Buffer.from(base64Data, "base64");
  const sizeBytes = buffer.length;

  if (sizeBytes > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: "Photo exceeds 5MB limit"
    };
  }

  return { valid: true, mimeType, sizeBytes };
}

export async function uploadPhoto(supabase: any, base64DataUrl: string, path: string): Promise<{ path: string }> {
  const validation = validatePhoto(base64DataUrl);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid photo");
  }

  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match![1].toLowerCase();
  const base64Data = match![2];
  const buffer = Buffer.from(base64Data, "base64");

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true
    });

  if (error) {
    throw new Error("Photo upload failed");
  }

  return { path: data.path || path };
}

export async function getSignedPhotoUrl(
  supabase: any,
  path: string,
  expiresIn: number = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error("Failed to generate signed photo URL");
  }

  return data.signedUrl;
}

export { BUCKET_NAME, MAX_SIZE_BYTES, ALLOWED_MIME_TYPES, DEFAULT_EXPIRY_SECONDS };