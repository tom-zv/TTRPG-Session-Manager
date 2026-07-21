import {
  HOMEBREW_SPELL_SOURCE,
  type Spell,
  type SpellAttackKind,
  type SpellCastingUnit,
  type SpellInput,
  type SpellSchool,
} from "shared/domain/dnd5e/spell.js";

// Form state: text for every input, converted to a SpellInput on submit.
export interface SpellDraft {
  name: string;
  source: string;
  page: string;
  level: string;
  school: SpellSchool;
  ritual: boolean;
  castingTime: string;
  castingTrigger: string;
  range: string;
  v: boolean;
  s: boolean;
  m: boolean;
  material: string;
  materialCostGp: string;
  materialConsumed: boolean;
  duration: string;
  description: string;
  higherLevels: string;
  classes: string[];
  damageTypes: string[];
  saves: string[];
  conditions: string[];
  attack: SpellAttackKind | "";
  aliases: string[];
}

export const blankSpellDraft = (): SpellDraft => ({
  name: "",
  source: HOMEBREW_SPELL_SOURCE,
  page: "",
  level: "1",
  school: "evocation",
  ritual: false,
  castingTime: "1 action",
  castingTrigger: "",
  range: "60 feet",
  v: true,
  s: true,
  m: false,
  material: "",
  materialCostGp: "",
  materialConsumed: false,
  duration: "Instantaneous",
  description: "",
  higherLevels: "",
  classes: [],
  damageTypes: [],
  saves: [],
  conditions: [],
  attack: "",
  aliases: [],
});

// "Duplicate as homebrew" keeps everything but the source and page; the copy links by its own name.
export function spellToDraft(spell: Spell, options: { duplicate?: boolean } = {}): SpellDraft {
  return {
    name: spell.name,
    source: options.duplicate ? HOMEBREW_SPELL_SOURCE : spell.source,
    page: options.duplicate || spell.page === undefined ? "" : String(spell.page),
    level: String(spell.level),
    school: spell.school,
    ritual: spell.ritual,
    castingTime: spell.castingTime,
    castingTrigger: spell.castingTrigger ?? "",
    range: spell.range,
    v: spell.components.v,
    s: spell.components.s,
    m: spell.components.m,
    material: spell.material ?? "",
    materialCostGp: spell.materialCostCp === undefined ? "" : String(spell.materialCostCp / 100),
    materialConsumed: spell.materialConsumed,
    duration: spell.duration,
    description: spell.description,
    higherLevels: spell.higherLevels ?? "",
    classes: spell.classes,
    damageTypes: spell.damageTypes,
    saves: spell.saves,
    conditions: spell.conditions,
    attack: spell.attack ?? "",
    aliases: spell.aliases,
  };
}

// "1 bonus action" -> bonus action, "10 minutes" -> minute; the unit drives the casting time filter.
export function deriveCastingUnit(castingTime: string): SpellCastingUnit {
  const text = castingTime.toLowerCase();
  if (text.includes("bonus")) return "bonus action";
  if (text.includes("reaction")) return "reaction";
  if (/\baction\b/.test(text)) return "action";
  if (text.includes("hour")) return "hour";
  if (text.includes("minute")) return "minute";
  return "action";
}

// "150 feet" -> 150, "1 mile" -> 5280; Self, Touch and areas have no distance to sort by.
export function deriveRangeFeet(range: string): number | undefined {
  const match = range.trim().match(/^(\d+)\s*(feet|foot|ft\.?|miles?)$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return /^mile/i.test(match[2]) ? amount * 5280 : amount;
}

export const isConcentrationDuration = (duration: string): boolean => /^\s*concentration\b/i.test(duration);

const optionalText = (value: string) => (value.trim() ? value.trim() : undefined);
const optionalNumber = (value: string) => (value.trim() === "" ? undefined : Number(value));

// Numbers that do not parse are passed through as NaN, so validateSpellInput reports them.
export function draftToInput(draft: SpellDraft): SpellInput {
  const costGp = optionalNumber(draft.materialCostGp);
  return {
    name: draft.name.trim(),
    source: draft.source.trim() || HOMEBREW_SPELL_SOURCE,
    ...(optionalNumber(draft.page) !== undefined ? { page: optionalNumber(draft.page) } : {}),
    level: Number(draft.level),
    school: draft.school,
    ritual: draft.ritual,
    concentration: isConcentrationDuration(draft.duration),
    castingTime: draft.castingTime.trim(),
    castingUnit: deriveCastingUnit(draft.castingTime),
    ...(optionalText(draft.castingTrigger) ? { castingTrigger: optionalText(draft.castingTrigger) } : {}),
    range: draft.range.trim(),
    ...(deriveRangeFeet(draft.range) !== undefined ? { rangeFeet: deriveRangeFeet(draft.range) } : {}),
    components: { v: draft.v, s: draft.s, m: draft.m },
    ...(draft.m && optionalText(draft.material) ? { material: optionalText(draft.material) } : {}),
    ...(draft.m && costGp !== undefined ? { materialCostCp: Math.round(costGp * 100) } : {}),
    materialConsumed: draft.m && draft.materialConsumed,
    duration: draft.duration.trim(),
    description: draft.description.trim(),
    ...(optionalText(draft.higherLevels) ? { higherLevels: optionalText(draft.higherLevels) } : {}),
    classes: draft.classes,
    damageTypes: draft.damageTypes.map(type => type.toLowerCase()),
    saves: draft.saves.map(save => save.toLowerCase()),
    conditions: draft.conditions.map(condition => condition.toLowerCase()),
    ...(draft.attack ? { attack: draft.attack } : {}),
    aliases: draft.aliases,
  };
}

export const CASTING_TIME_PRESETS = [
  "1 action", "1 bonus action", "1 reaction", "1 minute", "10 minutes", "1 hour", "8 hours", "12 hours", "24 hours",
];

export const RANGE_PRESETS = [
  "Self", "Touch", "5 feet", "30 feet", "60 feet", "90 feet", "120 feet", "150 feet", "300 feet", "1 mile", "Sight",
  "Unlimited", "Self (15-foot cone)", "Self (30-foot line)", "Self (10-foot emanation)", "Self (15-foot cube)",
];

export const DURATION_PRESETS = [
  "Instantaneous", "1 round", "1 minute", "10 minutes", "1 hour", "8 hours", "24 hours",
  "Concentration, up to 1 minute", "Concentration, up to 10 minutes", "Concentration, up to 1 hour",
  "Concentration, up to 8 hours", "Until dispelled", "Until dispelled or triggered", "Special",
];

export const DAMAGE_TYPE_PRESETS = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant",
  "slashing", "thunder",
];

export const SAVE_PRESETS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export const CONDITION_PRESETS = [
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed",
  "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious",
];

export const CLASS_PRESETS = [
  "Artificer", "Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard",
];
