import {
  ABILITY_KEYS,
  calcMod,
  type AbilityKey,
} from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import type { RecordOption } from "./options.js";

type AbilityScoreValues = Record<AbilityKey, number>;
export type RecordEntryMode = "proficient" | "expertise" | "custom";

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

export const getProficiencyBonusForCr = (cr?: string | null): number => {
  const parsedCr = parseChallengeRating(cr ?? "");
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

export const getRecordDefaultValue = (
  key: string,
  options: readonly RecordOption[],
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number,
  mode: Exclude<RecordEntryMode, "custom"> = "proficient"
): number | undefined => {
  const option = getRecordOption(options, key);
  if (!option) return undefined;
  const score = abilityScores[option.ability];
  const multiplier = mode === "expertise" ? 2 : 1;
  return calcMod(score) + proficiencyBonus * multiplier;
};

export const getSpellSaveDc = (
  ability: string | undefined,
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): number | undefined => {
  const attackBonus = getSpellAttackBonus(ability, abilityScores, proficiencyBonus);
  return attackBonus === undefined ? undefined : 8 + attackBonus;
};

export const getSpellAttackBonus = (
  ability: string | undefined,
  abilityScores: AbilityScoreValues,
  proficiencyBonus: number
): number | undefined => {
  const normalizedAbility = ABILITY_KEYS.find(key => key === ability?.trim());
  if (!normalizedAbility) return undefined;
  return calcMod(abilityScores[normalizedAbility]) + proficiencyBonus;
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

/** The average roll of a dice formula such as "5d10 + 5", rounded down as stat blocks print it. */
export const averageHp = (formula: string): number | undefined => {
  const match = formula.trim().match(/^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i);
  if (!match) return undefined;
  const [, count, sides, sign, bonus] = match;
  const average = Math.floor((Number(count) * (Number(sides) + 1)) / 2) + (bonus ? Number(bonus) * (sign === "-" ? -1 : 1) : 0);
  return average >= 0 ? average : undefined;
};
