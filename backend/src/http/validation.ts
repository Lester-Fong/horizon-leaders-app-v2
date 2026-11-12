export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function hasUnknownFields(
  record: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
) {
  return Object.keys(record).some((key) => !allowedFields.has(key));
}

export function readUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : undefined;
}

/** Trimmed non-empty text, or undefined when missing, blank, or not text. */
export function readRequiredText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Trimmed text or null (missing, null, or blank); undefined when not text. */
export function readOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

/** A real YYYY-MM-DD calendar date, or undefined. */
export function readCalendarDate(value: unknown) {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}
