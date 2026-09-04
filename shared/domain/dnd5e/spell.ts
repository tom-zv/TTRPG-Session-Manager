import type { WriteIssue, WriteValidation } from "../writeValidation.js";

export const SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;
export type SpellSchool = typeof SPELL_SCHOOLS[number];

export const SPELL_CASTING_UNITS = ["action", "bonus action", "reaction", "minute", "hour"] as const;
export type SpellCastingUnit = typeof SPELL_CASTING_UNITS[number];

export const SPELL_TAG_TYPES = ["class", "damage", "save", "condition", "attack", "alias"] as const;
export type SpellTagType = typeof SPELL_TAG_TYPES[number];

export type SpellAttackKind = "melee" | "ranged";

// Source of spells made in the app.
export const HOMEBREW_SPELL_SOURCE = "homebrew";

// Index row: everything the browser filters, sorts and lists by.
export interface SpellSummary {
  id: number;
  name: string;
  source: string;
  level: number;              // 0 = cantrip
  school: SpellSchool;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;        // '1 action', '1 bonus action', '10 minutes'
  castingUnit: SpellCastingUnit;
  components: { v: boolean; s: boolean; m: boolean };
  classes: string[];
  damageTypes: string[];
  saves: string[];            // ability names: 'dexterity', 'wisdom'
  aliases: string[];
}

export interface Spell extends SpellSummary {
  page?: number;
  castingTrigger?: string;    // reactions: 'which you take when you are hit by an attack roll...'
  range: string;              // 'Self', 'Touch', '150 feet', 'Self (15-foot cone)'
  rangeFeet?: number;
  material?: string;
  materialCostCp?: number;
  materialConsumed: boolean;
  duration: string;           // 'Instantaneous', 'Concentration, up to 1 minute'
  description: string;        // rich text, see shared/domain/dnd5e/richText.ts
  higherLevels?: string;      // rich text; heading depends on level
  conditions: string[];
  attack?: SpellAttackKind;
  locallyEdited: boolean;
}

// A mention of a spell: a monster's spell list entry or an inline {@spell Name|SRC} tag.
export interface SpellRef {
  name: string;
  source?: string;
}

type SpellLookupEntry = Pick<SpellSummary, "name" | "source" | "aliases">;

export interface SpellLookup<T extends SpellLookupEntry> {
  byName: Map<string, T[]>;
  byAlias: Map<string, T[]>;
}

export const spellKey = (name: string, source?: string): string =>
  `${name.trim().toLowerCase()}|${source?.trim().toLowerCase() ?? ""}`;

export function buildSpellLookup<T extends SpellLookupEntry>(spells: readonly T[]): SpellLookup<T> {
  const byName = new Map<string, T[]>();
  const byAlias = new Map<string, T[]>();
  const add = (map: Map<string, T[]>, key: string, spell: T) => {
    const normalized = key.trim().toLowerCase();
    const list = map.get(normalized);
    if (list) list.push(spell);
    else map.set(normalized, [spell]);
  };

  for (const spell of spells) {
    add(byName, spell.name, spell);
    for (const alias of spell.aliases) add(byAlias, alias, spell);
  }
  return { byName, byAlias };
}

// Name + source, then alias + source. A reference without a source prefers homebrew, then the first match.
// A reference whose source has no match stays unresolved: it names a book that is not imported.
export function resolveSpell<T extends SpellLookupEntry>(lookup: SpellLookup<T>, ref: SpellRef): T | undefined {
  const name = ref.name.trim().toLowerCase();
  const source = ref.source?.trim().toLowerCase();
  const candidates = lookup.byName.get(name) ?? [];
  const aliasCandidates = lookup.byAlias.get(name) ?? [];

  if (source) {
    const bySource = (spell: T) => spell.source.toLowerCase() === source;
    return candidates.find(bySource) ?? aliasCandidates.find(bySource);
  }

  const all = [...candidates, ...aliasCandidates];
  return all.find(spell => spell.source.toLowerCase() === HOMEBREW_SPELL_SOURCE) ?? all[0];
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// "Level 3 Evocation", "Evocation Cantrip"
export const formatSpellLevelSchool = (level: number, school: SpellSchool): string =>
  level === 0 ? `${capitalize(school)} Cantrip` : `Level ${level} ${capitalize(school)}`;

// "V, S, M (a ball of bat guano and sulfur)"
export function formatSpellComponents(
  components: SpellSummary["components"],
  material?: string
): string {
  const parts: string[] = [];
  if (components.v) parts.push("V");
  if (components.s) parts.push("S");
  if (components.m) parts.push(material ? `M (${material})` : "M");
  return parts.join(", ");
}

// What POST and PUT /api/dnd5e/spells accept. The form sends a full snapshot.
export interface SpellInput {
  name: string;
  source: string;
  page?: number;
  level: number;
  school: SpellSchool;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  castingUnit: SpellCastingUnit;
  castingTrigger?: string;
  range: string;
  rangeFeet?: number;
  components: { v: boolean; s: boolean; m: boolean };
  material?: string;
  materialCostCp?: number;
  materialConsumed: boolean;
  duration: string;
  description: string;
  higherLevels?: string;
  classes: string[];
  damageTypes: string[];
  saves: string[];
  conditions: string[];
  attack?: SpellAttackKind;
  aliases: string[];
}

// Field limits, matching dnd5e.spells and dnd5e.spell_tags.
export const SPELL_LIMITS = {
  name: 64,
  source: 16,
  castingTime: 64,
  castingTrigger: 512,
  range: 64,
  material: 512,
  duration: 64,
  description: 65535,
  higherLevels: 65535,
  tag: 64,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWholeNumber = (value: unknown, min = 0): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min;

/** Validates a spell snapshot and reports every problem by input path. */
export function validateSpellInput(input: unknown): WriteValidation<SpellInput> {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", message: "The spell must be an object." }] };
  const issues: WriteIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ path, message });

  const text = (key: keyof typeof SPELL_LIMITS, label: string, required: boolean) => {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      if (required) issue(key, `${label} is required.`);
      return;
    }
    if (typeof value !== "string") issue(key, `${label} must be text.`);
    else if (required && !value.trim()) issue(key, `${label} is required.`);
    else if (value.length > SPELL_LIMITS[key]) issue(key, `${label} can be at most ${SPELL_LIMITS[key]} characters.`);
  };
  const flag = (key: string, label: string) => {
    if (typeof input[key] !== "boolean") issue(key, `${label} must be true or false.`);
  };
  const list = (key: string, label: string) => {
    const value = input[key];
    if (!Array.isArray(value)) {
      issue(key, `${label} must be a list of names.`);
      return;
    }
    const invalid = value.findIndex((item, index) => index in value && (typeof item !== "string" || !item.trim()));
    if (invalid !== -1) {
      issue(`${key}.${invalid}`, `${label} must be a list of names.`);
      return;
    }
    const tooLong = value.findIndex((item, index) => index in value && (item as string).length > SPELL_LIMITS.tag);
    if (tooLong !== -1) issue(`${key}.${tooLong}`, `${label} can be at most ${SPELL_LIMITS.tag} characters each.`);
  };

  text("name", "Name", true);
  text("source", "Source", true);
  if (input.page !== undefined && !isWholeNumber(input.page, 1)) issue("page", "Page must be a whole number of at least 1.");
  if (!isWholeNumber(input.level) || (input.level as number) > 9) issue("level", "Level must be a whole number from 0 (cantrip) to 9.");
  if (!(SPELL_SCHOOLS as readonly unknown[]).includes(input.school)) issue("school", "Choose a school of magic.");
  flag("ritual", "Ritual");
  flag("concentration", "Concentration");
  text("castingTime", "Casting time", true);
  if (!(SPELL_CASTING_UNITS as readonly unknown[]).includes(input.castingUnit)) issue("castingUnit", "Choose a casting time unit.");
  text("castingTrigger", "Trigger", false);
  text("range", "Range", true);
  if (input.rangeFeet !== undefined && !isWholeNumber(input.rangeFeet)) issue("rangeFeet", "Range in feet must be a whole number.");

  const components = input.components;
  if (!isRecord(components) || ["v", "s", "m"].some(key => typeof components[key] !== "boolean")) {
    issue("components", "Components must say which of V, S and M apply.");
  }
  text("material", "Material", false);
  if (input.materialCostCp !== undefined && !isWholeNumber(input.materialCostCp)) {
    issue("materialCostCp", "Material cost must be a whole number of copper pieces.");
  }
  flag("materialConsumed", "Material consumed");
  if (isRecord(components) && components.m !== true && (input.material || input.materialCostCp !== undefined)) {
    issue(input.material ? "material" : "materialCostCp", "A material or its cost needs the M component.");
  }

  text("duration", "Duration", true);
  text("description", "Description", true);
  text("higherLevels", "Higher levels", false);
  list("classes", "Classes");
  list("damageTypes", "Damage types");
  list("saves", "Saving throws");
  list("conditions", "Conditions");
  list("aliases", "Aliases");
  if (input.attack !== undefined && input.attack !== "melee" && input.attack !== "ranged") {
    issue("attack", "Spell attack must be melee or ranged.");
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: input as unknown as SpellInput };
}
