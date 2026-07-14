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
  castingUnit: SpellCastingUnit;
  components: { v: boolean; s: boolean; m: boolean };
  classes: string[];
  damageTypes: string[];
  saves: string[];            // ability names: 'dexterity', 'wisdom'
  aliases: string[];
}

export interface Spell extends SpellSummary {
  page?: number;
  castingTime: string;        // '1 action', '1 bonus action', '10 minutes'
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
