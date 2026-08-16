import { ABILITY_NAMES } from "./constants.js";
import { asArray, asString, isRecord } from "./primitives.js";

export interface RenderOptions {
  // Tags written back in canonical form instead of rendered, e.g. ["spell"] -> "{@spell Fireball|XPHB}".
  keepTags?: readonly string[];
}

// Descriptive text: spell and item references stay tags so the app can link them.
export const DESCRIPTION_TEXT_OPTIONS: RenderOptions = { keepTags: ["spell", "item"] };

// The source a kept tag means when it names none, as the 5etools renderer reads it: "{@item potion
// of healing}" is the DMG printing. A spell without a source stays unqualified (resolveSpell decides).
const DEFAULT_TAG_SOURCES: Readonly<Record<string, string>> = { item: "DMG" };

export function render5eToolsText(value: string, options: RenderOptions = {}): string {
  return value
    .replace(/\{@h\}/gi, "Hit: ")
    .replace(/\{@recharge(?: ([^}]+))?\}/gi, (_match, recharge: string | undefined) => {
      const min = recharge?.trim();
      return `(Recharge ${min ? `${min}-6` : "6"})`;
    })
    .replace(/\{@([a-zA-Z0-9]+)(?: ([^{}]*?))?\}/g, (_match, tag: string, body = "") => {
      return options.keepTags?.includes(tag.toLowerCase()) ? keepTag(tag, body) : renderTag(tag, body);
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

export function renderEntryList(value: unknown, options: RenderOptions = {}): string[] {
  return asArray(value)
    .map(entry => renderEntry(entry, options))
    .filter(entry => entry.length > 0);
}

export function renderEntry(value: unknown, options: RenderOptions = {}): string {
  if (typeof value === "string") return render5eToolsText(value, options);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(entry => renderEntry(entry, options)).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";

  const name = asString(value.name);
  const prefix = name ? `${render5eToolsText(name)}. ` : "";

  if (value.entries !== undefined) return `${prefix}${renderEntryList(value.entries, options).join("\n")}`.trim();
  if (value.entry !== undefined) return `${prefix}${renderEntry(value.entry, options)}`.trim();
  if (value.items !== undefined) return `${prefix}${renderEntryList(value.items, options).join("\n")}`.trim();
  if (value.rows !== undefined) return `${prefix}${renderRows(value.rows, options)}`.trim();
  if (value.caption !== undefined) return render5eToolsText(String(value.caption), options);

  return "";
}

export function combineNotes(...notes: Array<string | undefined>): string | undefined {
  const combined = notes
    .filter((note): note is string => Boolean(note))
    .map(note => render5eToolsText(note))
    .join(" ");

  return combined || undefined;
}

// "{@spell fireball|xphb|Fireball}" -> "{@spell fireball|xphb|Fireball}"; "{@spell Fireball||Fireball}" -> "{@spell Fireball}";
// "{@item longsword||sword}" -> "{@item longsword|DMG|sword}"
function keepTag(tag: string, body: string): string {
  const kind = tag.toLowerCase();
  const [name = "", authoredSource = "", display = ""] = body.split("|").map(part => part.trim());
  if (!name) return "";
  const source = authoredSource || (DEFAULT_TAG_SOURCES[kind] ?? "");
  const parts = [name];
  const hasDisplay = display !== "" && display !== name;
  if (source || hasDisplay) parts.push(source);
  if (hasDisplay) parts.push(display);
  return `{@${kind} ${parts.join("|")}}`;
}

function renderTag(tag: string, body: string): string {
  switch (tag.toLowerCase()) {
    case "hit":
      // The source text supplies any "to hit" wording ("{@hit 9}, reach 5 ft." / "{@hit 9} to hit with spell attacks").
      return body.startsWith("+") || body.startsWith("-") ? body : `+${body}`;
    case "dc":
      return `DC ${body}`;
    case "damage":
    case "dice":
      return pipePart(body, 0);
    case "scaledice":
    case "scaledamage":
      // {@scaledamage 8d6|3-9|1d6}: base dice | slot levels | amount added per level
      return pipePart(body, 2) || pipePart(body, 0);
    case "chance":
      // {@chance 25|||Random reading!|Regular reading}
      return `${pipePart(body, 0)} percent`;
    case "book":
    case "filter":
      // {@book display|source|chapter|section}, {@filter display|page|filters...}
      return pipePart(body, 0);
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
      // {@tag name|source|display}
      return pipePart(body, 2) || pipePart(body, 0);
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

function pipePart(value: string, index: number): string {
  return value.split("|")[index]?.trim() ?? "";
}

function renderRows(value: unknown, options: RenderOptions): string {
  return asArray(value)
    .map(row => Array.isArray(row) ? row.map(cell => renderEntry(cell, options)).join(" | ") : renderEntry(row, options))
    .filter(Boolean)
    .join("\n");
}
