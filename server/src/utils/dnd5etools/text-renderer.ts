import { ABILITY_NAMES } from "./constants.js";
import { asArray, asString, isRecord } from "./primitives.js";

export function renderDnd5eToolsText(value: string): string {
  return value
    .replace(/\{@h\}/gi, "Hit: ")
    .replace(/\{@recharge(?: ([^}]+))?\}/gi, (_match, recharge: string | undefined) => {
      const min = recharge?.trim();
      return `(Recharge ${min ? `${min}-6` : "6"})`;
    })
    .replace(/\{@([a-zA-Z0-9]+)(?: ([^{}]*?))?\}/g, (_match, tag: string, body = "") => {
      return renderTag(tag, body);
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

export function renderEntryList(value: unknown): string[] {
  return asArray(value)
    .map(renderEntry)
    .filter(entry => entry.length > 0);
}

export function renderEntry(value: unknown): string {
  if (typeof value === "string") return renderDnd5eToolsText(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderEntry).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";

  const name = asString(value.name);
  const prefix = name ? `${renderDnd5eToolsText(name)}. ` : "";

  if (value.entries !== undefined) return `${prefix}${renderEntryList(value.entries).join("\n")}`.trim();
  if (value.entry !== undefined) return `${prefix}${renderEntry(value.entry)}`.trim();
  if (value.items !== undefined) return `${prefix}${renderEntryList(value.items).join("\n")}`.trim();
  if (value.rows !== undefined) return `${prefix}${renderRows(value.rows)}`.trim();
  if (value.caption !== undefined) return renderDnd5eToolsText(String(value.caption));

  return "";
}

export function combineNotes(...notes: Array<string | undefined>): string | undefined {
  const combined = notes
    .filter((note): note is string => Boolean(note))
    .map(renderDnd5eToolsText)
    .join(" ");

  return combined || undefined;
}

function renderTag(tag: string, body: string): string {
  switch (tag.toLowerCase()) {
    case "hit":
      return `${body.startsWith("+") || body.startsWith("-") ? body : `+${body}`} to hit`;
    case "dc":
      return `DC ${body}`;
    case "damage":
    case "dice":
    case "scaledice":
    case "scaledamage":
      return firstPipePart(body);
    case "atkr":
      return renderAttackTag(body);
    case "actsave":
      return `${ABILITY_NAMES[body.trim().toLowerCase()] ?? body} Saving Throw:`;
    case "actsavefail":
      return body ? `Failure ${body}:` : "Failure:";
    case "actsavesuccess":
      return "Success:";
    case "actsavesuccessorfail":
      return "Success or Failure:";
    default:
      return renderGenericTagBody(body);
  }
}

function renderAttackTag(body: string): string {
  const normalized = body.toLowerCase();
  const melee = normalized.includes("m");
  const ranged = normalized.includes("r");

  if (melee && ranged) return "Melee or Ranged Attack:";
  if (melee) return "Melee Attack:";
  if (ranged) return "Ranged Attack:";
  return "Attack:";
}

function renderGenericTagBody(body: string): string {
  const parts = body.split("|").map(part => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[2];
  return parts[0] ?? "";
}

function firstPipePart(value: string): string {
  return value.split("|")[0]?.trim() ?? "";
}

function renderRows(value: unknown): string {
  return asArray(value)
    .map(row => Array.isArray(row) ? row.map(renderEntry).join(" | ") : renderEntry(row))
    .filter(Boolean)
    .join("\n");
}
