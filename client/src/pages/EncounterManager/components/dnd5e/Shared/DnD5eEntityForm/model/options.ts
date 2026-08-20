import { DAMAGE_TYPES } from "shared/domain/encounters/dnd5e/entityValidation.js";
import type {
  ConditionImmunity,
  DnD5eEntityDetails,
  EntityAction,
  SpellcastingDisplay,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  type AbilityKey,
} from "../../dnd5eUtils.js";
import type { RecordOption, SpellGroupKind } from "../DnD5eEntityForm.types.js";

type LabeledOption<Value extends string = string> = {
  value: Value;
  label: string;
};

export const ROLE_OPTIONS = [
  { value: "creature", label: "Creature" },
  { value: "npc", label: "NPC" },
  { value: "pc", label: "PC" },
] satisfies Array<LabeledOption<DnD5eEntityDetails["role"]>>;

export const SIZE_OPTIONS = [
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "huge", label: "Huge" },
  { value: "gargantuan", label: "Gargantuan" },
] satisfies Array<LabeledOption<DnD5eEntityDetails["size"]>>;

export const ALIGNMENT_OPTIONS = [
  { value: "unaligned", label: "Unaligned" },
  { value: "lawful good", label: "Lawful Good" },
  { value: "neutral good", label: "Neutral Good" },
  { value: "chaotic good", label: "Chaotic Good" },
  { value: "lawful neutral", label: "Lawful Neutral" },
  { value: "neutral", label: "Neutral" },
  { value: "chaotic neutral", label: "Chaotic Neutral" },
  { value: "lawful evil", label: "Lawful Evil" },
  { value: "neutral evil", label: "Neutral Evil" },
  { value: "chaotic evil", label: "Chaotic Evil" },
  { value: "any alignment", label: "Any Alignment" },
];

export const CREATURE_TYPE_OPTIONS = [
  { value: "aberration", label: "Aberration" },
  { value: "beast", label: "Beast" },
  { value: "celestial", label: "Celestial" },
  { value: "construct", label: "Construct" },
  { value: "dragon", label: "Dragon" },
  { value: "elemental", label: "Elemental" },
  { value: "fey", label: "Fey" },
  { value: "fiend", label: "Fiend" },
  { value: "giant", label: "Giant" },
  { value: "humanoid", label: "Humanoid" },
  { value: "monstrosity", label: "Monstrosity" },
  { value: "ooze", label: "Ooze" },
  { value: "plant", label: "Plant" },
  { value: "undead", label: "Undead" },
];

export const SPEED_TYPE_OPTIONS = [
  { value: "walk", label: "Walk" },
  { value: "burrow", label: "Burrow" },
  { value: "climb", label: "Climb" },
  { value: "fly", label: "Fly" },
  { value: "swim", label: "Swim" },
  { value: "hover", label: "Hover" },
];

export const ABILITY_PRESETS: Array<{
  label: string;
  scores: Record<AbilityKey, number>;
}> = [
  { label: "Commoner", scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
  { label: "Brute", scores: { str: 16, dex: 10, con: 16, int: 8, wis: 10, cha: 8 } },
  { label: "Skirmisher", scores: { str: 10, dex: 16, con: 12, int: 10, wis: 12, cha: 10 } },
  { label: "Caster", scores: { str: 8, dex: 12, con: 12, int: 14, wis: 14, cha: 16 } },
];

export const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.map(value => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const CONDITION_OPTIONS = [
  { value: "blinded", label: "Blinded" },
  { value: "charmed", label: "Charmed" },
  { value: "deafened", label: "Deafened" },
  { value: "exhaustion", label: "Exhaustion" },
  { value: "frightened", label: "Frightened" },
  { value: "grappled", label: "Grappled" },
  { value: "incapacitated", label: "Incapacitated" },
  { value: "invisible", label: "Invisible" },
  { value: "paralyzed", label: "Paralyzed" },
  { value: "petrified", label: "Petrified" },
  { value: "poisoned", label: "Poisoned" },
  { value: "prone", label: "Prone" },
  { value: "restrained", label: "Restrained" },
  { value: "stunned", label: "Stunned" },
  { value: "unconscious", label: "Unconscious" },
] satisfies Array<LabeledOption<ConditionImmunity["conditionName"]>>;

export const SKILL_OPTIONS = [
  { value: "acrobatics", label: "Acrobatics", ability: "dex" },
  { value: "animal handling", label: "Animal Handling", ability: "wis" },
  { value: "arcana", label: "Arcana", ability: "int" },
  { value: "athletics", label: "Athletics", ability: "str" },
  { value: "deception", label: "Deception", ability: "cha" },
  { value: "history", label: "History", ability: "int" },
  { value: "insight", label: "Insight", ability: "wis" },
  { value: "intimidation", label: "Intimidation", ability: "cha" },
  { value: "investigation", label: "Investigation", ability: "int" },
  { value: "medicine", label: "Medicine", ability: "wis" },
  { value: "nature", label: "Nature", ability: "int" },
  { value: "perception", label: "Perception", ability: "wis" },
  { value: "performance", label: "Performance", ability: "cha" },
  { value: "persuasion", label: "Persuasion", ability: "cha" },
  { value: "religion", label: "Religion", ability: "int" },
  { value: "sleight of hand", label: "Sleight of Hand", ability: "dex" },
  { value: "stealth", label: "Stealth", ability: "dex" },
  { value: "survival", label: "Survival", ability: "wis" },
] satisfies RecordOption[];

export const SAVE_OPTIONS: RecordOption[] = ABILITY_KEYS.map((ability) => ({
  value: ability,
  label: ABILITY_FULL_NAMES[ability],
  ability,
}));

export const SENSE_PRESETS = [
  "darkvision 60 ft.",
  "darkvision 120 ft.",
  "blindsight 10 ft.",
  "blindsight 30 ft.",
  "tremorsense 60 ft.",
  "truesight 120 ft.",
];

export const LANGUAGE_PRESETS = [
  "Common",
  "Draconic",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Goblin",
  "Infernal",
  "Orc",
  "Sylvan",
  "telepathy 60 ft.",
  "understands Common but can't speak",
];

export const ACTION_TYPE_OPTIONS = [
  { value: "action", label: "Action" },
  { value: "bonus action", label: "Bonus Action" },
  { value: "reaction", label: "Reaction" },
  { value: "legendary", label: "Legendary" },
  { value: "mythic", label: "Mythic" },
  { value: "lair", label: "Lair" },
  { value: "villain", label: "Villain" },
] satisfies Array<LabeledOption<EntityAction["actionType"]>>;

// "" keeps the block in its own Spellcasting section (stored as no displayAs).
export const SPELLCASTING_DISPLAY_OPTIONS = [
  { value: "", label: "Spellcasting" },
  { value: "trait", label: "Trait" },
  { value: "action", label: "Action" },
  { value: "bonus action", label: "Bonus Action" },
  { value: "reaction", label: "Reaction" },
  { value: "legendary", label: "Legendary" },
] satisfies Array<LabeledOption<"" | SpellcastingDisplay>>;

export const SPELLCASTING_ABILITY_OPTIONS = [
  { value: "", label: "None" },
  ...ABILITY_KEYS.map((ability) => ({ value: ability, label: ABILITY_FULL_NAMES[ability] })),
] satisfies Array<LabeledOption<"" | AbilityKey>>;

export const SPELL_GROUP_KIND_OPTIONS = [
  { value: "level", label: "Spell level (slots)" },
  { value: "will", label: "At will" },
  { value: "constant", label: "Constant" },
  { value: "daily", label: "Per day" },
  { value: "rest", label: "Per rest" },
  { value: "restLong", label: "Per long rest" },
  { value: "weekly", label: "Per week" },
  { value: "monthly", label: "Per month" },
  { value: "yearly", label: "Per year" },
  { value: "recharge", label: "Recharge" },
  { value: "charges", label: "Charges" },
  { value: "legendary", label: "Legendary action" },
  { value: "ritual", label: "Ritual" },
] satisfies Array<LabeledOption<SpellGroupKind>>;
