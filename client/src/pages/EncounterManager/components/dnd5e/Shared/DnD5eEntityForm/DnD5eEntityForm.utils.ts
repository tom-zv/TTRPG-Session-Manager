import type {
  ConditionImmunity,
  DamageModifier,
  DnD5eEntityDetails,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  type AbilityKey,
  calcMod,
} from "../DnD5eEntityCard/DnD5eEntityCard.utils.js";
import type {
  ActionEntryDraft,
  AbilityScoresDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  EntityFormValidationResult,
  RecordEntryDraft,
  RecordEntryMode,
  RecordOption,
  SpeedDraft,
  SpellcastingDraft,
  TextEntryDraft,
} from "./DnD5eEntityForm.types.js";

type AbilityScoreValues = AbilityScoresDraft | Record<AbilityKey, number>;
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

export const DAMAGE_TYPE_OPTIONS = [
  { value: "acid", label: "Acid" },
  { value: "bludgeoning", label: "Bludgeoning" },
  { value: "cold", label: "Cold" },
  { value: "fire", label: "Fire" },
  { value: "force", label: "Force" },
  { value: "lightning", label: "Lightning" },
  { value: "necrotic", label: "Necrotic" },
  { value: "piercing", label: "Piercing" },
  { value: "poison", label: "Poison" },
  { value: "psychic", label: "Psychic" },
  { value: "radiant", label: "Radiant" },
  { value: "slashing", label: "Slashing" },
  { value: "thunder", label: "Thunder" },
] satisfies Array<LabeledOption<DamageModifier["damageType"]>>;

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

export const SPELLCASTING_DISPLAY_OPTIONS = [
  { value: "spellcasting", label: "Spellcasting" },
  { value: "trait", label: "Trait" },
  { value: "action", label: "Action" },
  { value: "bonus action", label: "Bonus Action" },
  { value: "reaction", label: "Reaction" },
] satisfies Array<LabeledOption<NonNullable<EntitySpellcasting["displayAs"]>>>;

export const SPELLCASTING_ABILITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "int", label: "Intelligence" },
  { value: "wis", label: "Wisdom" },
  { value: "cha", label: "Charisma" },
] satisfies Array<LabeledOption<"" | AbilityKey>>;

const DEFAULT_ABILITY_SCORES: Record<AbilityKey, number> = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const createRowId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createBlankSpeed = (type = ""): SpeedDraft => ({
  id: createRowId("speed"),
  type,
  value: type === "walk" ? "30" : "",
});

export const createBlankRecordEntry = (prefix: string): RecordEntryDraft => ({
  id: createRowId(prefix),
  key: "",
  value: "",
  mode: "custom",
});

export const createBlankDamageModifier = (prefix: string): DamageModifierDraft => ({
  id: createRowId(prefix),
  damageType: "",
  conditionNote: "",
});

export const createBlankConditionImmunity = (): ConditionImmunityDraft => ({
  id: createRowId("condition-immunity"),
  conditionName: "",
  conditionNote: "",
});

export const createBlankTrait = (): TextEntryDraft => ({
  id: createRowId("trait"),
  name: "",
  description: "",
});

export const createBlankAction = (actionType = "action"): ActionEntryDraft => ({
  id: createRowId("action"),
  name: "",
  description: "",
  actionType,
});

export const createBlankSpellcasting = (): SpellcastingDraft => ({
  id: createRowId("spellcasting"),
  name: "Spellcasting",
  displayAs: "spellcasting",
  ability: "",
  saveDc: "",
  spellAttackBonus: "",
  descriptionsText: "",
});

export const calcPassivePerception = (wisScore: number): number =>
  10 + calcMod(wisScore);

export const toSigned = (value: number): string =>
  value >= 0 ? `+${value}` : String(value);

export const getProficiencyBonusForCr = (cr: string): number => {
  const parsedCr = parseChallengeRating(cr);
  if (parsedCr == null) return 2;
  if (parsedCr <= 4) return 2;
  if (parsedCr <= 8) return 3;
  if (parsedCr <= 12) return 4;
  if (parsedCr <= 16) return 5;
  if (parsedCr <= 20) return 6;
  if (parsedCr <= 24) return 7;
  if (parsedCr <= 28) return 8;
  return 9;
};

export const getRecordOption = (
  options: readonly RecordOption[],
  value: string
): RecordOption | undefined => {
  const normalizedValue = value.trim().toLowerCase();
  return options.find((option) => option.value === normalizedValue);
};

export const getRecordEntryValue = (
  row: Pick<RecordEntryDraft, "key" | "mode" | "value">,
  options: readonly RecordOption[],
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): string => {
  if (row.mode === "custom") return row.value;
  return getRecordDefaultValue(row.key, options, abilityScores, proficiencyBonus, row.mode);
};

export const getRecordDefaultValue = (
  key: string,
  options: readonly RecordOption[],
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number,
  mode: Exclude<RecordEntryMode, "custom"> = "proficient"
): string => {
  const option = getRecordOption(options, key);
  if (!option) return "";
  const score = readAbilityScore(abilityScores, option.ability);
  const multiplier = mode === "expertise" ? 2 : 1;
  return toSigned(calcMod(score) + proficiencyBonus * multiplier);
};

export const getSpellSaveDc = (
  ability: string,
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): string => {
  const normalizedAbility = ability.trim() as AbilityKey;
  if (!ABILITY_KEYS.includes(normalizedAbility)) return "";
  return String(8 + calcMod(readAbilityScore(abilityScores, normalizedAbility)) + proficiencyBonus);
};

export const getSpellAttackBonus = (
  ability: string,
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): string => {
  const normalizedAbility = ability.trim() as AbilityKey;
  if (!ABILITY_KEYS.includes(normalizedAbility)) return "";
  return toSigned(calcMod(readAbilityScore(abilityScores, normalizedAbility)) + proficiencyBonus);
};

const parseChallengeRating = (cr: string): number | undefined => {
  const trimmed = cr.trim();
  if (!trimmed) return undefined;

  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readAbilityScore = (
  abilityScores: AbilityScoreValues,
  ability: AbilityKey
): number => {
  const value = abilityScores[ability];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ABILITY_SCORES[ability];
};

export const createEntityDraft = (
  entity?: DnD5eEntityDetails
): DnD5eEntityFormDraft => {
  const abilityScores = ABILITY_KEYS.reduce<AbilityScoresDraft>((draft, ability) => {
    draft[ability] = String(entity?.abilityScores?.[ability] ?? DEFAULT_ABILITY_SCORES[ability]);
    return draft;
  }, {} as AbilityScoresDraft);

  const speeds = Object.entries(entity?.speeds ?? { walk: 30 }).map(([type, value], index) => ({
    id: `speed-${index}-${type}`,
    type,
    value: String(value),
  }));

  return {
    name: entity?.name ?? "",
    imageUrl: entity?.imageUrl ?? "",
    role: entity?.role ?? "creature",
    creatureType: entity?.creatureType ?? "",
    typeTags: entity?.typeTags ?? [],
    cr: entity?.cr ?? "",
    ac: String(entity?.ac ?? 10),
    hp: String(entity?.hp ?? 1),
    hpFormula: entity?.hpFormula ?? "",
    speeds: speeds.length > 0 ? speeds : [createBlankSpeed("walk")],
    size: entity?.size ?? "medium",
    alignment: entity?.alignment ?? "unaligned",
    abilityScores,
    saves: recordToRows(entity?.saves, "save"),
    skills: recordToRows(entity?.skills, "skill"),
    passivePerceptionMode: entity?.passivePerception ? "manual" : "auto",
    passivePerception: entity?.passivePerception ? String(entity.passivePerception) : "",
    senses: entity?.senses ?? [],
    languages: entity?.languages ?? [],
    vulnerabilities: damageModifiersToRows(entity?.vulnerabilities, "vulnerability"),
    resistances: damageModifiersToRows(entity?.resistances, "resistance"),
    immunities: damageModifiersToRows(entity?.immunities, "immunity"),
    conditionImmunities: conditionImmunitiesToRows(entity?.conditionImmunities),
    traits: textEntriesToRows(entity?.traits, "trait"),
    actions: actionsToRows(entity?.actions),
    spellcasting: spellcastingToRows(entity?.spellcasting),
    legendaryActionCount: String(entity?.legendaryActionCount ?? 0),
    legendaryHeaderText: entity?.legendaryHeader?.join("\n") ?? "",
  };
};

export const buildEntityFromDraft = (
  draft: DnD5eEntityFormDraft
): EntityFormValidationResult => {
  const errors: string[] = [];
  const name = draft.name.trim();
  const ac = readRequiredInteger(draft.ac, "Armor Class", errors, 1);
  const hp = readRequiredInteger(draft.hp, "Hit Points", errors, 1);
  const abilityScores = readAbilityScores(draft.abilityScores, errors);
  const legendaryActionCount = readOptionalInteger(
    draft.legendaryActionCount,
    "Legendary action count",
    errors,
    0
  ) ?? 0;
  const speeds = readSpeeds(draft.speeds, errors);
  const passivePerception =
    draft.passivePerceptionMode === "auto"
      ? calcPassivePerception(abilityScores.wis)
      : readOptionalInteger(draft.passivePerception, "Passive Perception", errors, 1);
  const proficiencyBonus = getProficiencyBonusForCr(draft.cr);

  if (!name) errors.push("Name is required.");

  const saves = rowsToRecord(
    draft.saves,
    "Saving Throws",
    errors,
    SAVE_OPTIONS,
    abilityScores,
    proficiencyBonus
  );
  const skills = rowsToRecord(
    draft.skills,
    "Skills",
    errors,
    SKILL_OPTIONS,
    abilityScores,
    proficiencyBonus
  );
  const vulnerabilities = rowsToDamageModifiers(draft.vulnerabilities, "Vulnerabilities", errors);
  const resistances = rowsToDamageModifiers(draft.resistances, "Resistances", errors);
  const immunities = rowsToDamageModifiers(draft.immunities, "Immunities", errors);
  const conditionImmunities = rowsToConditionImmunities(draft.conditionImmunities, errors);
  const traits = rowsToTraits(draft.traits, errors);
  const actions = rowsToActions(draft.actions, errors);
  const spellcasting = rowsToSpellcasting(draft.spellcasting, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    entity: {
      name,
      imageUrl: draft.imageUrl.trim(),
      role: draft.role,
      creatureType: draft.creatureType.trim(),
      typeTags: normalizeStringArray(draft.typeTags),
      cr: draft.cr.trim(),
      ac,
      hp,
      hpFormula: draft.hpFormula.trim(),
      speeds,
      size: draft.size,
      alignment: draft.alignment.trim() || "unaligned",
      abilityScores,
      saves,
      skills,
      passivePerception,
      senses: normalizeStringArray(draft.senses),
      languages: normalizeStringArray(draft.languages),
      vulnerabilities,
      resistances,
      immunities,
      conditionImmunities,
      traits,
      actions,
      spellcasting,
      legendaryActionCount,
      legendaryHeader: normalizeMultiline(draft.legendaryHeaderText),
    },
  };
};

export const normalizeStringArray = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
};

export const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeMultiline = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const recordToRows = (
  record: Record<string, string> | undefined,
  prefix: string
): RecordEntryDraft[] =>
  Object.entries(record ?? {}).map(([key, value], index) => ({
    id: `${prefix}-${index}-${key}`,
    key,
    value,
    mode: "custom",
  }));

const damageModifiersToRows = (
  modifiers: DamageModifier[] | undefined,
  prefix: string
): DamageModifierDraft[] =>
  (modifiers ?? []).map((modifier, index) => ({
    id: `${prefix}-${index}-${modifier.damageType}`,
    damageType: modifier.damageType,
    conditionNote: modifier.conditionNote ?? "",
  }));

const conditionImmunitiesToRows = (
  immunities: ConditionImmunity[] | undefined
): ConditionImmunityDraft[] =>
  (immunities ?? []).map((immunity, index) => ({
    id: `condition-immunity-${index}-${immunity.conditionName}`,
    conditionName: immunity.conditionName,
    conditionNote: immunity.conditionNote ?? "",
  }));

const textEntriesToRows = (
  entries: EntityTrait[] | undefined,
  prefix: string
): TextEntryDraft[] =>
  (entries ?? []).map((entry, index) => ({
    id: `${prefix}-${index}-${entry.name}`,
    name: entry.name,
    description: entry.description,
  }));

const actionsToRows = (actions: EntityAction[] | undefined): ActionEntryDraft[] =>
  (actions ?? []).map((action, index) => ({
    id: `action-${index}-${action.actionType}-${action.name}`,
    name: action.name,
    description: action.description,
    actionType: action.actionType,
  }));

const spellcastingToRows = (
  spellcasting: EntitySpellcasting[] | undefined
): SpellcastingDraft[] =>
  (spellcasting ?? []).map((entry, index) => ({
    id: `spellcasting-${index}-${entry.name}`,
    name: entry.name,
    displayAs: entry.displayAs ?? "spellcasting",
    ability: entry.ability ?? "",
    saveDc: entry.saveDc != null ? String(entry.saveDc) : "",
    spellAttackBonus:
      entry.spellAttackBonus != null ? String(entry.spellAttackBonus) : "",
    descriptionsText: entry.descriptions?.join("\n") ?? "",
    levels: entry.levels,
    freqSpells: entry.freqSpells,
  }));

const readRequiredInteger = (
  value: string,
  label: string,
  errors: string[],
  min?: number
): number => {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isInteger(parsed) || (min != null && parsed < min)) {
    errors.push(`${label} must be a whole number${min != null ? ` of at least ${min}` : ""}.`);
    return min ?? 0;
  }

  return parsed;
};

const readOptionalInteger = (
  value: string,
  label: string,
  errors: string[],
  min?: number
): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return readRequiredInteger(trimmed, label, errors, min);
};

const readAbilityScores = (
  draft: AbilityScoresDraft,
  errors: string[]
): Record<AbilityKey, number> =>
  ABILITY_KEYS.reduce<Record<AbilityKey, number>>((scores, ability) => {
    scores[ability] = readRequiredInteger(
      draft[ability],
      ability.toUpperCase(),
      errors,
      1
    );
    return scores;
  }, {} as Record<AbilityKey, number>);

const readSpeeds = (
  rows: SpeedDraft[],
  errors: string[]
): DnD5eEntityDetails["speeds"] => {
  const speeds: DnD5eEntityDetails["speeds"] = {};
  const filledRows = rows.filter((row) => row.type.trim() || row.value.trim());

  for (const row of filledRows) {
    const type = row.type.trim().toLowerCase();
    const value = readRequiredInteger(row.value, `${type || "Speed"} speed`, errors, 0);
    if (!type) {
      errors.push("Each speed needs a movement type.");
      continue;
    }
    speeds[type] = value;
  }

  if (Object.keys(speeds).length === 0) speeds.walk = 30;
  return speeds;
};

const rowsToRecord = (
  rows: RecordEntryDraft[],
  label: string,
  errors: string[],
  options: readonly RecordOption[],
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): Record<string, string> => {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim().toLowerCase();
    const value = getRecordEntryValue(row, options, abilityScores, proficiencyBonus).trim();
    if (!key && !value) continue;
    if (!key || !value) {
      errors.push(`${label} rows need both a name and a value.`);
      continue;
    }
    record[key] = value;
  }
  return record;
};

const rowsToDamageModifiers = (
  rows: DamageModifierDraft[],
  label: string,
  errors: string[]
): DamageModifier[] => {
  const modifiers: DamageModifier[] = [];
  for (const row of rows) {
    const damageType = row.damageType.trim().toLowerCase();
    const conditionNote = row.conditionNote.trim();
    if (!damageType && !conditionNote) continue;
    if (!damageType) {
      errors.push(`${label} rows need a damage type.`);
      continue;
    }
    modifiers.push({
      damageType,
      conditionNote: conditionNote || undefined,
    });
  }
  return modifiers;
};

const rowsToConditionImmunities = (
  rows: ConditionImmunityDraft[],
  errors: string[]
): ConditionImmunity[] => {
  const immunities: ConditionImmunity[] = [];
  for (const row of rows) {
    const conditionName = row.conditionName.trim().toLowerCase();
    const conditionNote = row.conditionNote.trim();
    if (!conditionName && !conditionNote) continue;
    if (!conditionName) {
      errors.push("Condition immunity rows need a condition.");
      continue;
    }
    immunities.push({
      conditionName,
      conditionNote: conditionNote || undefined,
    });
  }
  return immunities;
};

const rowsToTraits = (rows: TextEntryDraft[], errors: string[]): EntityTrait[] =>
  rows.reduce<EntityTrait[]>((entries, row, index) => {
    const name = row.name.trim();
    const description = row.description.trim();
    if (!name && !description) return entries;
    if (!name || !description) {
      errors.push("Trait rows need both a name and description.");
      return entries;
    }
    entries.push({ name, description, sortOrder: index });
    return entries;
  }, []);

const rowsToActions = (rows: ActionEntryDraft[], errors: string[]): EntityAction[] =>
  rows.reduce<EntityAction[]>((entries, row, index) => {
    const name = row.name.trim();
    const description = row.description.trim();
    if (!name && !description) return entries;
    if (!name || !description) {
      errors.push("Action rows need both a name and description.");
      return entries;
    }
    entries.push({
      name,
      description,
      actionType: row.actionType.trim() || "action",
      sortOrder: index,
    });
    return entries;
  }, []);

const rowsToSpellcasting = (
  rows: SpellcastingDraft[],
  errors: string[]
): EntitySpellcasting[] =>
  rows.reduce<EntitySpellcasting[]>((entries, row) => {
    const name = row.name.trim();
    const descriptions = normalizeMultiline(row.descriptionsText);
    const saveDc = readOptionalInteger(row.saveDc, "Spell save DC", errors, 0);
    const spellAttackBonus = readOptionalInteger(
      row.spellAttackBonus,
      "Spell attack bonus",
      errors
    );
    const hasAnyValue =
      name ||
      row.displayAs.trim() ||
      row.ability.trim() ||
      row.saveDc.trim() ||
      row.spellAttackBonus.trim() ||
      descriptions.length > 0 ||
      Boolean(row.levels?.length) ||
      Boolean(row.freqSpells && Object.keys(row.freqSpells).length > 0);

    if (!hasAnyValue) return entries;
    if (!name) {
      errors.push("Spellcasting rows need a name.");
      return entries;
    }

    entries.push({
      name,
      displayAs: optionalString(row.displayAs),
      ability: optionalString(row.ability),
      saveDc,
      spellAttackBonus,
      descriptions,
      levels: row.levels,
      freqSpells: row.freqSpells,
    });
    return entries;
  }, []);
