import {
  ABILITY_KEYS,
  calcMod,
  formatSignedNumber,
  type AbilityKey,
} from "../../dnd5eUtils.js";
import type {
  AbilityScoresDraft,
  RecordEntryDraft,
  RecordEntryMode,
  RecordOption,
} from "../DnD5eEntityForm.types.js";

type AbilityScoreValues = AbilityScoresDraft | Record<AbilityKey, number>;

export const DEFAULT_ABILITY_SCORES: Record<AbilityKey, number> = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const calcPassivePerception = (wisScore: number): number =>
  10 + calcMod(wisScore);

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
  return formatSignedNumber(calcMod(score) + proficiencyBonus * multiplier);
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
  return formatSignedNumber(calcMod(readAbilityScore(abilityScores, normalizedAbility)) + proficiencyBonus);
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

export const readAbilityScore = (
  abilityScores: AbilityScoreValues,
  ability: AbilityKey
): number => {
  const value = abilityScores[ability];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ABILITY_SCORES[ability];
};
