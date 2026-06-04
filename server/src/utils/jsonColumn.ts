import { isPlainObject } from "shared/domain/encounters/settings.js";

/**
 * Reads a JSON object column. mysql2 usually returns JSON columns already parsed, but some
 * drivers and configurations return strings. NULL and non-object values read as `{}`.
 * Malformed JSON throws, so a read-modify-write never silently replaces corrupt data.
 */
export function readJsonObjectColumn(value: unknown): Record<string, unknown> {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return isPlainObject(parsed) ? parsed : {};
}
