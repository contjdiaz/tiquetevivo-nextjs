/**
 * Shared validation module for TiqueteVivo API endpoints.
 * All validators return { valid: boolean, error?: string, value?: any }.
 */

const ALLOWED_STATUSES = ["RECEIVED", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

export function validatePhone(
  phone: any
): { valid: boolean; value?: string; error?: string } {
  if (phone == null || typeof phone !== "string") {
    return { valid: false, error: "Phone number is required and must be a string" };
  }

  const normalized = phone.replace(/[+\s\-]/g, "");

  if (!/^\d+$/.test(normalized)) {
    return { valid: false, error: "Phone number must contain only digits (after removing +, spaces, and dashes)" };
  }

  if (normalized.length < 10 || normalized.length > 15) {
    return { valid: false, error: "Phone number must be between 10 and 15 digits" };
  }

  return { valid: true, value: normalized };
}

export function validateAmount(
  value: any,
  fieldName: string
): { valid: boolean; value?: number; error?: string } {
  if (value == null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  const num = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a finite number` };
  }

  if (num < 0) {
    return { valid: false, error: `${fieldName} must be non-negative` };
  }

  if (num > 99999999.99) {
    return { valid: false, error: `${fieldName} must not exceed 99,999,999.99` };
  }

  return { valid: true, value: num };
}

export function validateStatus(status: any): { valid: boolean; value?: string; error?: string } {
  if (status == null || typeof status !== "string") {
    return { valid: false, error: "Status is required and must be a string" };
  }

  const upper = status.toUpperCase();

  if (!ALLOWED_STATUSES.includes(upper)) {
    return {
      valid: false,
      error: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}. Received: "${status}"`
    };
  }

  return { valid: true, value: upper };
}

export function validateRequired(
  body: any,
  fields: string[]
): { valid: boolean; errors?: string[] } {
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body is required"] };
  }

  const errors: string[] = [];

  for (const field of fields) {
    const value = body[field];
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      errors.push(`${field} is required and must not be empty`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

export function validateStatusInFlow(
  status: any,
  statusFlow: any[]
): { valid: boolean; value?: string; error?: string } {
  if (status == null || typeof status !== "string") {
    return { valid: false, error: "Status is required and must be a string" };
  }

  if (!Array.isArray(statusFlow) || statusFlow.length === 0) {
    return { valid: false, error: "Status flow configuration is required" };
  }

  const upper = status.toUpperCase();
  const match = statusFlow.find((entry: any) => entry.status_key.toUpperCase() === upper);

  if (!match) {
    const validStatuses = statusFlow.map((entry: any) => entry.status_key).join(", ");
    return {
      valid: false,
      error: `Status must be one of: ${validStatuses}. Received: '${status}'`
    };
  }

  return { valid: true, value: match.status_key };
}

export function validateStatusTransition(
  currentStatus: string,
  targetStatus: string,
  statusFlow: any[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(statusFlow) || statusFlow.length === 0) {
    return { valid: false, error: "Status flow configuration is required" };
  }

  const currentUpper = currentStatus.toUpperCase();
  const targetUpper = targetStatus.toUpperCase();

  const currentIndex = statusFlow.findIndex(
    (entry: any) => entry.status_key.toUpperCase() === currentUpper
  );

  if (currentIndex === -1) {
    const validStatuses = statusFlow.map((entry: any) => entry.status_key).join(", ");
    return {
      valid: false,
      error: `Status must be one of: ${validStatuses}. Received: '${currentStatus}'`
    };
  }

  if (targetUpper === "CANCELLED") {
    return { valid: true };
  }

  const targetIndex = statusFlow.findIndex(
    (entry: any) => entry.status_key.toUpperCase() === targetUpper
  );

  if (targetIndex === -1) {
    const validStatuses = statusFlow.map((entry: any) => entry.status_key).join(", ");
    return {
      valid: false,
      error: `Status must be one of: ${validStatuses}. Received: '${targetStatus}'`
    };
  }

  if (targetIndex === currentIndex + 1) {
    return { valid: true };
  }

  const nextIndex = currentIndex + 1;
  const nextStatus = nextIndex < statusFlow.length
    ? statusFlow[nextIndex].status_key
    : "CANCELLED";

  return {
    valid: false,
    error: `Cannot transition from ${statusFlow[currentIndex].status_key} to ${statusFlow[targetIndex].status_key}. Next valid: ${nextStatus}`
  };
}

function isValidDate(value: any): boolean {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (isNaN(date.getTime())) return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isValidDatetime(value: any): boolean {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

export function validateCustomFields(
  values: any,
  definitions: any[]
): { valid: boolean; errors?: string[] } {
  if (!definitions || !Array.isArray(definitions) || definitions.length === 0) {
    return { valid: true };
  }

  const safeValues = values || {};
  const errors: string[] = [];

  for (const def of definitions) {
    const { field_key, display_label, field_type, required, options } = def;
    const value = safeValues[field_key];

    if (required && (value === undefined || value === null)) {
      errors.push(`${display_label} is required`);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    switch (field_type) {
      case "text":
        if (typeof value !== "string") {
          errors.push(`${display_label} must be a text`);
        }
        break;

      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`${display_label} must be a number`);
        }
        break;

      case "date":
        if (!isValidDate(value)) {
          errors.push(`${display_label} must be a date`);
        }
        break;

      case "datetime":
        if (!isValidDatetime(value)) {
          errors.push(`${display_label} must be a datetime`);
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`${display_label} must be a boolean`);
        }
        break;

      case "select":
        if (!Array.isArray(options) || !options.includes(value)) {
          errors.push(`${display_label} must be a select`);
        }
        break;

      case "time":
        if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
          errors.push(`${display_label} must be a time in HH:MM format`);
        }
        break;

      case "textarea":
        if (typeof value !== "string") {
          errors.push(`${display_label} must be a text`);
        }
        break;

      default:
        break;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}