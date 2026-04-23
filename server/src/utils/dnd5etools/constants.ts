import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";

export const ABILITY_NAMES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const ALIGNMENT_NAMES: Record<string, string> = {
  L: "lawful",
  N: "neutral",
  NX: "neutral",
  NY: "neutral",
  C: "chaotic",
  G: "good",
  E: "evil",
  U: "unaligned",
  A: "any alignment",
};

export const SIZE_NAMES: Record<string, DnD5eEntityDB["size"]> = {
  T: "tiny",
  S: "small",
  M: "medium",
  L: "large",
  H: "huge",
  G: "gargantuan",
};

export const STANDARD_DAMAGE_TYPES = new Set([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

export const TAG_ARRAY_FIELDS: Array<{ field: string; tagType: string }> = [
  { field: "group", tagType: "group" },
  { field: "environment", tagType: "environment" },
  { field: "treasure", tagType: "treasure" },
  { field: "referenceSources", tagType: "reference_source" },
  { field: "traitTags", tagType: "trait" },
  { field: "senseTags", tagType: "sense" },
  { field: "actionTags", tagType: "action" },
  { field: "languageTags", tagType: "language" },
  { field: "damageTags", tagType: "damage" },
  { field: "damageTagsSpell", tagType: "damage" },
  { field: "spellcastingTags", tagType: "spell" },
  { field: "miscTags", tagType: "misc" },
  { field: "conditionInflict", tagType: "condition" },
  { field: "conditionInflictSpell", tagType: "condition" },
  { field: "savingThrowForced", tagType: "save" },
  { field: "savingThrowForcedSpell", tagType: "save_spell" },
];
