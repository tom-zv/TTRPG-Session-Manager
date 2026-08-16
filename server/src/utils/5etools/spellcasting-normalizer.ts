import type {
  EntitySpellcastingDB,
  SpellcastingLevelDB,
} from "src/api/encounter/entities/dnd5e/types.js";
import {
  SPELL_FREQUENCIES,
  type SpellcastingDisplay,
  type SpellEntry,
  type SpellFrequency,
  type SpellFrequencyGroup,
} from "shared/domain/encounters/dnd5e/entity.js";
import { ABILITY_NAMES, MONSTER_TEXT_OPTIONS } from "./constants.js";
import { asArray, asNumber, asString, fitField, isRecord, uniqueBy } from "./primitives.js";
import { render5eToolsText, renderEntryList } from "./text-renderer.js";

// 5etools spellcasting keys that hold a plain spell list.
const LIST_FREQUENCIES = ["constant", "will", "ritual"] as const satisfies readonly SpellFrequency[];
// 5etools spellcasting keys that hold { "<count>[e]": spells[] }.
const COUNTED_FREQUENCIES = [
  "rest",
  "restLong",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "recharge",
  "charges",
  "legendary",
] as const satisfies readonly SpellFrequency[];

// Keys of a 5etools spellcasting block that are not spell lists.
const NON_SPELL_KEYS = new Set([
  "name",
  "type",
  "headerEntries",
  "entries",
  "footerEntries",
  "ability",
  "displayAs",
  "hidden",
  "spells",
  "chargesItem",
]);

const DISPLAY_AS: Record<string, SpellcastingDisplay> = {
  trait: "trait",
  action: "action",
  bonus: "bonus action",
  reaction: "reaction",
  legendary: "legendary",
};

const SPELL_NAME_MAX = 64;
const SPELL_NOTE_MAX = 512;

export function normalizeSpellcasting(value: unknown, warnings: string[]): EntitySpellcastingDB[] {
  return asArray(value).filter(isRecord).map((spellcasting, index) => {
    const rawDescriptions = [
      ...renderEntryList(spellcasting.headerEntries, MONSTER_TEXT_OPTIONS),
      ...renderEntryList(spellcasting.entries, MONSTER_TEXT_OPTIONS),
      ...renderEntryList(spellcasting.footerEntries, MONSTER_TEXT_OPTIONS),
    ];
    const descriptionText = rawDescriptions.join(" ");
    const name = render5eToolsText(asString(spellcasting.name) ?? "Spellcasting");

    warnUnknownKeys(spellcasting, name, warnings);

    return {
      name: fitField(name, 64, `spellcasting ${index + 1} name`, warnings),
      display_as: normalizeDisplayAs(asString(spellcasting.displayAs), name, warnings),
      ability: normalizeAbility(asString(spellcasting.ability)),
      save_dc: extractSaveDc(descriptionText),
      spell_attack_bonus: extractSpellAttackBonus(descriptionText),
      descriptions: rawDescriptions.map(stripSpellcastingCombatParenthetical),
      hide_spell_list: isSpellListHidden(spellcasting) || undefined,
      levels: normalizeSpellLevels(spellcasting.spells, warnings),
      frequency_groups: normalizeFrequencyGroups(spellcasting, warnings),
    };
  });
}

function normalizeDisplayAs(
  value: string | undefined,
  blockName: string,
  warnings: string[]
): SpellcastingDisplay | undefined {
  if (!value) return undefined;
  const display = DISPLAY_AS[value.toLowerCase()];
  if (!display) warnings.push(`Unknown spellcasting displayAs "${value}" on "${blockName}"; listed under Spellcasting.`);
  return display;
}

function normalizeAbility(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase();
  return normalized && normalized in ABILITY_NAMES ? normalized : undefined;
}

function extractSaveDc(value: string): number | undefined {
  return asNumber(value.match(/\bDC\s+(\d+)\b/i)?.[1]);
}

function extractSpellAttackBonus(value: string): number | undefined {
  return asNumber(value.match(/([+-]\d+)\s+to hit/i)?.[1]);
}

// "...as the spellcasting ability (spell save DC 17, +9 to hit with spell attacks):" -> "...as the spellcasting ability:"
// The DC and attack bonus are stored as fields and shown separately.
function stripSpellcastingCombatParenthetical(value: string): string {
  return value
    .replace(
      /\s*\((?=[^)]*(?:spell save\s+DC\s+\d+|[+-]\d+\s+to hit))[^)]*\)([:.;]?)\s*$/i,
      "$1"
    )
    .replace(/\s+([:.;])$/g, "$1")
    .trim();
}

// 5etools `hidden` names the spell lists the stat block does not print because the text already names the spells.
function isSpellListHidden(spellcasting: Record<string, unknown>): boolean {
  const hidden = new Set(asArray(spellcasting.hidden).map(asString).filter(Boolean));
  if (hidden.size === 0) return false;

  const presentLists = [
    ...(spellcasting.spells !== undefined ? ["spells"] : []),
    ...[...LIST_FREQUENCIES, ...COUNTED_FREQUENCIES].filter(key => spellcasting[key] !== undefined),
  ];
  return presentLists.length > 0 && presentLists.every(key => hidden.has(key));
}

function warnUnknownKeys(spellcasting: Record<string, unknown>, blockName: string, warnings: string[]): void {
  const known = new Set<string>([...NON_SPELL_KEYS, ...LIST_FREQUENCIES, ...COUNTED_FREQUENCIES]);
  for (const key of Object.keys(spellcasting)) {
    if (!known.has(key)) warnings.push(`Ignored spellcasting key "${key}" on "${blockName}".`);
  }
}

function normalizeSpellLevels(value: unknown, warnings: string[]): SpellcastingLevelDB[] | undefined {
  if (!isRecord(value)) return undefined;

  const levels = Object.entries(value).map(([levelKey, levelValue]) => {
    const level = Number(levelKey);
    const levelRecord = isRecord(levelValue) ? levelValue : {};
    const spellsValue = isRecord(levelValue) ? levelRecord.spells : levelValue;
    const lowerLevel = asNumber(levelRecord.lower);

    return {
      level,
      slots: asNumber(levelRecord.slots),
      lower_level: lowerLevel !== undefined && lowerLevel !== level ? lowerLevel : undefined,
      spells: normalizeSpellList(spellsValue, warnings),
    };
  }).filter(level => Number.isInteger(level.level) && level.spells.length > 0);

  return levels.length > 0 ? levels.sort((a, b) => a.level - b.level) : undefined;
}

function normalizeFrequencyGroups(
  spellcasting: Record<string, unknown>,
  warnings: string[]
): SpellFrequencyGroup[] | undefined {
  const groups: SpellFrequencyGroup[] = [];

  for (const frequency of LIST_FREQUENCIES) {
    const spells = normalizeSpellList(spellcasting[frequency], warnings);
    if (spells.length > 0) groups.push({ frequency, spells });
  }

  for (const frequency of COUNTED_FREQUENCIES) {
    const value = spellcasting[frequency];
    if (value === undefined) continue;
    if (!isRecord(value)) {
      warnings.push(`Ignored spellcasting "${frequency}" list that is not keyed by count.`);
      continue;
    }

    const entries = Object.entries(value)
      .map(([detail, spells]) => ({ ...parseFrequencyDetail(detail), spells: normalizeSpellList(spells, warnings) }))
      .filter(group => group.spells.length > 0)
      // Higher counts first, as stat blocks list them ("2/day each" before "1/day each").
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

    for (const entry of entries) groups.push({ frequency, ...entry });
  }

  // Stored in stat block order so display needs no re-sorting (stable sort keeps count order).
  groups.sort((a, b) => SPELL_FREQUENCIES.indexOf(a.frequency) - SPELL_FREQUENCIES.indexOf(b.frequency));

  return groups.length > 0 ? groups : undefined;
}

// "2e" -> { count: 2, each: true }; "1" -> { count: 1 }
function parseFrequencyDetail(detail: string): Pick<SpellFrequencyGroup, "count" | "each"> {
  const match = detail.trim().match(/^(\d+)(e?)$/i);
  if (!match) return {};
  return { count: Number(match[1]), ...(match[2] ? { each: true } : {}) };
}

function normalizeSpellList(value: unknown, warnings: string[]): SpellEntry[] {
  const spells = asArray(value)
    .map(spell => normalizeSpellEntry(spell, warnings))
    .filter((spell): spell is SpellEntry => Boolean(spell));

  return uniqueBy(spells, spell => `${spell.name.toLowerCase()}|${spell.note?.toLowerCase() ?? ""}`);
}

// "{@spell Fireball|XPHB} (level 5 version)" -> { name: "Fireball", source: "XPHB", note: "level 5 version" }
function normalizeSpellEntry(value: unknown, warnings: string[]): SpellEntry | undefined {
  if (isRecord(value)) {
    const name = asString(value.name) ?? asString(value.spell);
    return name ? buildSpellEntry(render5eToolsText(name), undefined, undefined, warnings) : undefined;
  }
  if (typeof value !== "string") return undefined;

  const tagged = value.match(/^\s*\{@spell ([^|}]+)(?:\|([^|}]*))?[^}]*\}(.*)$/i);
  if (tagged) {
    return buildSpellEntry(tagged[1].trim(), tagged[2]?.trim() || undefined, render5eToolsText(tagged[3]), warnings);
  }

  // Untagged text: "Fireball (level 5 version)"
  const rendered = render5eToolsText(value);
  const parenIndex = rendered.indexOf("(");
  return parenIndex > 0
    ? buildSpellEntry(rendered.slice(0, parenIndex), undefined, rendered.slice(parenIndex), warnings)
    : buildSpellEntry(rendered, undefined, undefined, warnings);
}

function buildSpellEntry(
  rawName: string,
  source: string | undefined,
  rawNote: string | undefined,
  warnings: string[]
): SpellEntry | undefined {
  const name = rawName.trim();
  if (!name) return undefined;

  const note = rawNote?.trim().replace(/^\((.*)\)$/s, "$1").trim();
  return {
    name: fitField(name, SPELL_NAME_MAX, "spell name", warnings),
    ...(source ? { source: source.slice(0, 16) } : {}),
    ...(note ? { note: fitField(note, SPELL_NOTE_MAX, `spell note for ${name}`, warnings) } : {}),
  };
}
