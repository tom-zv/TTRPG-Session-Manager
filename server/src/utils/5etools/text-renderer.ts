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

// The pipe part holding a tag's display text, where it is not the third.
const DISPLAY_PARTS: Readonly<Record<string, number>> = {
  card: 3, // name|set|source|display
  deity: 3, // name|pantheon|source|display
  quickref: 4, // name|source|chapter|section|display
  classfeature: 5, // name|class|classSource|level|source|display
  subclassfeature: 7, // name|class|classSource|subclass|subclassSource|level|source|display
};

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

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
    case "hityourspellattack":
      // {@hitYourSpellAttack} or {@hitYourSpellAttack display}, for summons that use the caster's bonus
      return pipePart(body, 0) || "your spell attack modifier";
    case "dc":
      return `DC ${body}`;
    case "dcyourspellsave":
      return pipePart(body, 0) || "your spell save DC";
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
    case "skillcheck":
      return renderSkillCheckTag(body);
    case "adventure":
    case "book":
    case "filter":
      // {@book display|source|chapter|section}, {@adventure ...} alike, {@filter display|page|filters...}
      return pipePart(body, 0);
    case "atk":
      return renderAttackTag(body, "Attack:");
    case "atkr":
      return renderAttackTag(body, "Attack Roll:");
    case "hom":
      return "Hit or Miss: ";
    case "acttrigger":
      return "Trigger:";
    case "actresponse":
      // {@actResponse d} runs straight into the saving throw that follows it
      return body.includes("d") ? "Response\u2014" : "Response:";
    case "actsave":
      return `${ABILITY_NAMES[body.trim().toLowerCase()] ?? body} Saving Throw:`;
    case "actsavefail":
      // {@actSaveFail 2} -> "Second Failure:"
      return body ? `${ORDINALS[Number(body) - 1] ?? body} Failure:` : "Failure:";
    case "actsavefailby":
      return `Failure by ${pipePart(body, 0)} or More:`;
    case "actsavesuccess":
      return "Success:";
    case "actsavesuccessorfail":
      return "Failure or Success:";
    default:
      // Mostly {@tag name|source|display}; DISPLAY_PARTS lists the tags with more parts before the display text.
      return pipePart(body, DISPLAY_PARTS[tag.toLowerCase()] ?? 2) || pipePart(body, 0);
  }
}

const ATTACK_RANGES: Readonly<Record<string, string>> = { m: "Melee", r: "Ranged", g: "Magical", a: "Area" };
const ATTACK_KINDS: Readonly<Record<string, string>> = { w: "Weapon", s: "Spell", p: "Power" };

// Attack tags as 5etools renders them: "mw" -> "Melee Weapon Attack:", "ms,rs" -> "Melee or Ranged Spell
// Attack:". A letter shared by several groups is kept only in the last.
function renderAttackTag(body: string, suffix: "Attack:" | "Attack Roll:"): string {
  const groups = body.toLowerCase().split(",").map(group => group.trim()).filter(Boolean).map(group => [...group]);
  const seen = new Set(groups.at(-1));
  for (let i = groups.length - 2; i >= 0; i--) {
    groups[i] = (groups[i] ?? []).filter(letter => {
      const unseen = !seen.has(letter);
      seen.add(letter);
      return unseen;
    });
  }

  const words = groups.map(letters => {
    const range = Object.keys(ATTACK_RANGES).find(key => letters.includes(key));
    const kind = Object.keys(ATTACK_KINDS).find(key => letters.includes(key));
    return [range && ATTACK_RANGES[range], kind && ATTACK_KINDS[kind]].filter(Boolean).join(" ");
  });
  const label = words.filter(Boolean).join(" or ");
  return label ? `${label} ${suffix}` : suffix;
}

// {@skillCheck animal_handling 5} or {@skillCheck animal_handling 5|display}: shows the modifier, "+5".
function renderSkillCheckTag(body: string): string {
  const display = pipePart(body, 1);
  if (display) return display;
  const modifier = pipePart(body, 0).split(" ").slice(1).join(" ");
  const value = Number(modifier);
  return modifier && !Number.isNaN(value) ? `${value < 0 ? "" : "+"}${value}` : modifier;
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
