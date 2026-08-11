import type { SpellTagDB, SpellWriteDB } from "src/api/encounter/spells/types.js";
import type { SpellCastingUnit, SpellSchool } from "shared/domain/dnd5e/spell.js";
import { SPELL_CASTING_UNITS } from "shared/domain/dnd5e/spell.js";
import { formatTableRow } from "shared/domain/dnd5e/richText.js";
import { asArray, asNumber, asString, fitField, isRecord, unique } from "./primitives.js";
import { DESCRIPTION_TEXT_OPTIONS, renderDnd5eToolsText, renderEntry, type RenderOptions } from "./text-renderer.js";

export type Dnd5eToolsSpell = Record<string, unknown>;

// Class names per spell from 5etools generated/gendata-spell-source-lookup.json.
export type SpellClassLookup = (name: string, source: string) => string[];

export interface Dnd5eToolsSpellImportPayload {
  spell: SpellWriteDB;
  tags: SpellTagDB[];
  warnings: string[];
}

// Description text keeps spell and item references. Lead-in names and the casting trigger keep
// only spell tags, as before item links: they render as plain text.
const SPELL_TEXT_OPTIONS = DESCRIPTION_TEXT_OPTIONS;
const LABEL_TEXT_OPTIONS: RenderOptions = { keepTags: ["spell"] };

const SCHOOLS: Record<string, SpellSchool> = {
  A: "abjuration",
  C: "conjuration",
  D: "divination",
  E: "enchantment",
  V: "evocation",
  I: "illusion",
  N: "necromancy",
  T: "transmutation",
};

// Class sources from the official books; the lookup also lists third-party and Unearthed Arcana classes.
const CLASS_SOURCES = new Set(["XPHB", "PHB", "TCE", "EFA"]);

const SPELL_ATTACKS: Record<string, string> = { M: "melee", R: "ranged" };

const AREA_SHAPES: Record<string, (size: string) => string> = {
  cone: size => `${size} cone`,
  line: size => `${size} line`,
  cube: size => `${size} cube`,
  emanation: size => `${size} emanation`,
  sphere: size => `${size}-radius sphere`,
  hemisphere: size => `${size}-radius hemisphere`,
  radius: size => `${size} radius`,
  cylinder: size => `${size}-radius cylinder`,
};

const FEET_PER_MILE = 5280;

export function parseDnd5eToolsSpells(input: unknown): Dnd5eToolsSpell[] {
  if (Array.isArray(input)) return input.filter(isRecord);
  if (!isRecord(input)) throw new Error("DnD5eTools spell data must be a JSON object or array.");
  if (Array.isArray(input.spell)) return input.spell.filter(isRecord);
  if (typeof input.name === "string") return [input];
  throw new Error('No spell array found. Expected a "spell" array or a bare array of spells.');
}

export function buildSpellClassLookup(input: unknown): SpellClassLookup {
  return (name, source) => {
    const bySource = isRecord(input) ? input[source.toLowerCase()] : undefined;
    const entry = isRecord(bySource) ? bySource[name.toLowerCase()] : undefined;
    const classes = isRecord(entry) ? entry.class : undefined;
    if (!isRecord(classes)) return [];

    const names = Object.entries(classes)
      .filter(([classSource, byName]) => CLASS_SOURCES.has(classSource) && isRecord(byName))
      .flatMap(([, byName]) => Object.keys(byName as Record<string, unknown>));
    return unique(names).sort();
  };
}

// Throws when a required field (name, level, school) is missing or invalid.
export function transformDnd5eToolsSpell(
  spell: Dnd5eToolsSpell,
  classLookup?: SpellClassLookup
): Dnd5eToolsSpellImportPayload {
  const warnings: string[] = [];
  const rawName = asString(spell.name)?.trim();
  if (!rawName) throw new Error("Spell without a name.");
  const name = fitField(rawName, 64, "name", warnings);
  const source = fitField(asString(spell.source)?.trim() || "homebrew", 16, "source", warnings);

  const level = asNumber(spell.level);
  if (level === undefined || !Number.isInteger(level) || level < 0 || level > 9) {
    throw new Error(`${name}: level must be 0-9, got ${String(spell.level)}.`);
  }
  const school = SCHOOLS[asString(spell.school)?.toUpperCase() ?? ""];
  if (!school) throw new Error(`${name}: unknown school ${String(spell.school)}.`);

  const casting = normalizeCastingTime(spell.time, warnings);
  const range = normalizeRange(spell.range, warnings);
  const components = normalizeComponents(spell.components, warnings);
  const durations = asArray(spell.duration).filter(isRecord);
  const meta = isRecord(spell.meta) ? spell.meta : {};

  const row: SpellWriteDB = {
    name,
    source,
    page: asNumber(spell.page) ?? null,
    level,
    school,
    ritual: meta.ritual === true,
    concentration: durations.some(duration => duration.concentration === true),
    casting_time: fitField(casting.text, 64, "casting time", warnings),
    casting_unit: casting.unit,
    casting_trigger: casting.trigger ? fitField(casting.trigger, 512, "casting trigger", warnings) : null,
    range_text: fitField(range.text, 64, "range", warnings),
    range_feet: range.feet ?? null,
    comp_v: components.v,
    comp_s: components.s,
    comp_m: components.m,
    material: components.material ? fitField(components.material, 512, "material", warnings) : null,
    material_cost_cp: components.costCp ?? null,
    material_consumed: components.consumed,
    duration: fitField(normalizeDuration(durations, warnings), 64, "duration", warnings),
    description: renderSpellEntries(spell.entries, warnings),
    higher_levels: renderHigherLevels(spell.entriesHigherLevel, warnings) || null,
  };

  return { spell: row, tags: buildSpellTags(spell, row, classLookup, warnings), warnings };
}

function normalizeCastingTime(
  value: unknown,
  warnings: string[]
): { text: string; unit: SpellCastingUnit; trigger?: string } {
  const times = asArray(value).filter(isRecord);
  if (times.length === 0) {
    warnings.push("No casting time; using 1 action.");
    return { text: "1 action", unit: "action" };
  }

  const parts = times.map(time => {
    const number = asNumber(time.number) ?? 1;
    const unit = normalizeCastingUnit(asString(time.unit), warnings);
    const label = unit === "minute" || unit === "hour" ? pluralize(unit, number) : unit;
    const note = asString(time.note);
    return { unit, text: `${number} ${label}${note ? ` (${note})` : ""}`, condition: asString(time.condition) };
  });

  const condition = parts.find(part => part.condition)?.condition;
  return {
    // Plant Growth: "1 action (Overgrowth) or 8 hours (Enrichment)"
    text: parts.map(part => part.text).join(" or "),
    unit: parts[0].unit,
    ...(condition ? { trigger: renderDnd5eToolsText(condition, LABEL_TEXT_OPTIONS) } : {}),
  };
}

function normalizeCastingUnit(value: string | undefined, warnings: string[]): SpellCastingUnit {
  const unit = value === "bonus" ? "bonus action" : value;
  if ((SPELL_CASTING_UNITS as readonly string[]).includes(unit ?? "")) return unit as SpellCastingUnit;
  warnings.push(`Unknown casting time unit "${value ?? ""}"; using action.`);
  return "action";
}

function normalizeRange(value: unknown, warnings: string[]): { text: string; feet?: number } {
  if (!isRecord(value)) {
    warnings.push("No range; using Self.");
    return { text: "Self" };
  }
  const type = asString(value.type);
  const distance = isRecord(value.distance) ? value.distance : {};
  const distanceType = asString(distance.type);
  const amount = asNumber(distance.amount);

  if (type === "special") return { text: "Special" };

  if (type === "point") {
    switch (distanceType) {
      case "self": return { text: "Self" };
      case "touch": return { text: "Touch" };
      case "sight": return { text: "Sight" };
      case "unlimited": return { text: "Unlimited" };
      case "feet": return { text: `${amount ?? 0} ${amount === 1 ? "foot" : "feet"}`, feet: amount };
      case "miles":
        return { text: `${amount ?? 0} ${pluralize("mile", amount ?? 0)}`, feet: (amount ?? 0) * FEET_PER_MILE };
    }
  }

  const shape = type ? AREA_SHAPES[type] : undefined;
  if (shape && amount !== undefined && (distanceType === "feet" || distanceType === "miles")) {
    const size = `${amount}-${distanceType === "feet" ? "foot" : "mile"}`;
    return { text: `Self (${shape(size)})` };
  }

  warnings.push(`Unknown range ${JSON.stringify(value)}; using Special.`);
  return { text: "Special" };
}

function normalizeComponents(value: unknown, warnings: string[]): {
  v: boolean;
  s: boolean;
  m: boolean;
  material?: string;
  costCp?: number;
  consumed: boolean;
} {
  const components = isRecord(value) ? value : {};
  const material = components.m;
  const base = { v: components.v === true, s: components.s === true, m: material !== undefined && material !== false };

  if (typeof material === "string") return { ...base, material: renderDnd5eToolsText(material), consumed: false };
  if (isRecord(material)) {
    const text = asString(material.text);
    if (!text) warnings.push("Material component without text.");
    return {
      ...base,
      ...(text ? { material: renderDnd5eToolsText(text) } : {}),
      ...(asNumber(material.cost) !== undefined ? { costCp: asNumber(material.cost) } : {}),
      // "optional" consumption is described in the text; only a definite consume is flagged.
      consumed: material.consume === true,
    };
  }
  return { ...base, consumed: false };
}

function normalizeDuration(durations: Record<string, unknown>[], warnings: string[]): string {
  if (durations.length === 0) {
    warnings.push("No duration; using Instantaneous.");
    return "Instantaneous";
  }
  return durations.map(duration => {
    switch (asString(duration.type)) {
      case "instant":
        return "Instantaneous";
      case "timed": {
        const timed = isRecord(duration.duration) ? duration.duration : {};
        const amount = asNumber(timed.amount) ?? 1;
        const text = `${amount} ${pluralize(asString(timed.type) ?? "round", amount)}`;
        if (duration.concentration === true) return `Concentration, up to ${text}`;
        return timed.upTo === true ? `Up to ${text}` : text;
      }
      case "permanent": {
        const ends = asArray(duration.ends).map(asString);
        if (ends.includes("dispel") && ends.includes("trigger")) return "Until dispelled or triggered";
        if (ends.includes("dispel")) return "Until dispelled";
        if (ends.includes("trigger")) return "Until triggered";
        return "Permanent";
      }
      case "special":
        return "Special";
      default:
        warnings.push(`Unknown duration ${JSON.stringify(duration)}; using Special.`);
        return "Special";
    }
  }).join(" or ");
}

function pluralize(unit: string, amount: number): string {
  return amount === 1 ? unit : `${unit}s`;
}

const renderText = (value: string) => renderDnd5eToolsText(value, SPELL_TEXT_OPTIONS);
const renderLabel = (value: string) => renderDnd5eToolsText(value, LABEL_TEXT_OPTIONS);

// 5etools entries -> rich text blocks (shared/domain/dnd5e/richText.ts), separated by a blank line.
export function renderSpellEntries(value: unknown, warnings: string[]): string {
  return asArray(value).flatMap(entry => entryBlocks(entry, warnings)).filter(Boolean).join("\n\n");
}

// The heading ("Using a Higher-Level Spell Slot" / "Cantrip Upgrade") is dropped; the display supplies it by level.
function renderHigherLevels(value: unknown, warnings: string[]): string {
  return asArray(value)
    .map(entry => isRecord(entry) && entry.entries !== undefined ? renderSpellEntries(entry.entries, warnings) : renderSpellEntries([entry], warnings))
    .filter(Boolean)
    .join("\n\n");
}

function entryBlocks(entry: unknown, warnings: string[]): string[] {
  if (typeof entry === "string") return [renderText(entry)];
  if (!isRecord(entry)) return [];

  const name = asString(entry.name);
  switch (asString(entry.type)) {
    case "entries":
    case "section":
    case "inset": {
      const children = asArray(entry.entries).flatMap(child => entryBlocks(child, warnings));
      if (!name) return children;
      const lead = `**${renderLabel(name)}.**`;
      const [first, ...rest] = children;
      return first !== undefined && !isStructuredBlock(first) ? [`${lead} ${first}`, ...rest] : [lead, ...children];
    }
    case "list":
      return [asArray(entry.items).flatMap(listItemTexts).map(text => `- ${text}`).join("\n")];
    case "item":
      return [listItemText(entry)];
    case "table":
      return [renderTable(entry)];
    default: {
      const text = renderEntry(entry, SPELL_TEXT_OPTIONS).replace(/\s*\n\s*/g, " ");
      warnings.push(`Unhandled entry type "${asString(entry.type) ?? "unknown"}" rendered as plain text.`);
      return text ? [text] : [];
    }
  }
}

const isStructuredBlock = (block: string) => block.startsWith("- ") || block.startsWith("|") || block.startsWith("**");

function listItemTexts(item: unknown): string[] {
  if (isRecord(item) && item.type === "list") return asArray(item.items).flatMap(listItemTexts);
  const text = listItemText(item);
  return text ? [text] : [];
}

function listItemText(item: unknown): string {
  if (typeof item === "string") return renderText(item);
  if (!isRecord(item)) return "";
  const name = asString(item.name);
  const body = asArray(item.entries ?? item.entry)
    .map(child => typeof child === "string" ? renderText(child) : renderEntry(child, SPELL_TEXT_OPTIONS))
    .join(" ")
    .replace(/\s*\n\s*/g, " ");
  return name ? `**${renderLabel(name).replace(/[.:]$/, "")}.** ${body}`.trim() : body;
}

function renderTable(table: Record<string, unknown>): string {
  const rows = asArray(table.rows).map(row => asArray(row).map(renderCell));
  const columnCount = Math.max(asArray(table.colLabels).length, ...rows.map(row => row.length));
  const labels = asArray(table.colLabels).map(label => renderText(asString(label) ?? ""));
  const header = labels.length > 0 ? labels : Array.from({ length: columnCount }, () => "");
  const caption = asString(table.caption);

  return [
    ...(caption ? [renderText(caption)] : []),
    formatTableRow(header),
    ...rows.map(formatTableRow),
  ].join("\n");
}

// Cells are strings, or {type: "cell", roll: {exact} | {min, max}} for dice tables.
function renderCell(cell: unknown): string {
  if (isRecord(cell) && cell.entry !== undefined) return renderEntry(cell.entry, SPELL_TEXT_OPTIONS).replace(/\s*\n\s*/g, " ");
  if (isRecord(cell) && isRecord(cell.roll)) {
    const exact = asNumber(cell.roll.exact);
    if (exact !== undefined) return String(exact);
    return `${asNumber(cell.roll.min) ?? ""}-${asNumber(cell.roll.max) ?? ""}`;
  }
  return (typeof cell === "string" ? renderText(cell) : renderEntry(cell, SPELL_TEXT_OPTIONS)).replace(/\s*\n\s*/g, " ");
}

function buildSpellTags(
  spell: Dnd5eToolsSpell,
  row: SpellWriteDB,
  classLookup: SpellClassLookup | undefined,
  warnings: string[]
): SpellTagDB[] {
  const list = (value: unknown) => asArray(value).map(asString).filter((item): item is string => Boolean(item));
  const tags: SpellTagDB[] = [
    ...(classLookup?.(row.name, row.source) ?? []).map(tag => ({ tag_type: "class" as const, tag })),
    ...list(spell.damageInflict).map(tag => ({ tag_type: "damage" as const, tag: tag.toLowerCase() })),
    ...list(spell.savingThrow).map(tag => ({ tag_type: "save" as const, tag: tag.toLowerCase() })),
    ...list(spell.conditionInflict).map(tag => ({ tag_type: "condition" as const, tag: tag.toLowerCase() })),
    ...list(spell.spellAttack).flatMap(tag => {
      const attack = SPELL_ATTACKS[tag.toUpperCase()];
      if (!attack) warnings.push(`Unknown spell attack "${tag}".`);
      return attack ? [{ tag_type: "attack" as const, tag: attack }] : [];
    }),
    ...list(spell.alias).map(tag => ({ tag_type: "alias" as const, tag })),
  ];

  const seen = new Set<string>();
  return tags
    .map(tag => ({ ...tag, tag: fitField(tag.tag.trim(), 64, `${tag.tag_type} tag`, warnings) }))
    .filter(tag => {
      const key = `${tag.tag_type}|${tag.tag.toLowerCase()}`;
      if (!tag.tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
