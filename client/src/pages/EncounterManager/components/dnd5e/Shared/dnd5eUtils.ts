import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";

export type AbilityKey = keyof DnD5eEntityDetails["abilityScores"];

export const ABILITY_KEYS: AbilityKey[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

export const ABILITY_FULL_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const calcMod = (score: number): number => Math.floor((score - 10) / 2);

export const formatSignedNumber = (value: number): string =>
  value >= 0 ? `+${value}` : String(value);

export const formatSignedValue = (value: string | number): string => {
  if (typeof value === "number") return formatSignedNumber(value);

  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[+-]/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
};

export const capitalize = (value: string | undefined): string => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const titleCase = (value: string): string =>
  value
    .split(/([\s/-]+)/)
    .map((part) => (/^[\s/-]+$/.test(part) ? part : capitalize(part.toLowerCase())))
    .join("");
