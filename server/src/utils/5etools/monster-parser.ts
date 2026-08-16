import type { FiveEToolsMonster } from "./types.js";
import { isRecord } from "./primitives.js";

export function parse5eToolsMonsters(input: unknown): FiveEToolsMonster[] {
  if (Array.isArray(input)) return input.filter(isRecord) as FiveEToolsMonster[];

  if (!isRecord(input)) {
    throw new Error("5etools import data must be a JSON object or array.");
  }

  for (const key of ["monster", "monsters", "creature", "creatures", "data"]) {
    const value = input[key];
    if (Array.isArray(value)) return value.filter(isRecord) as FiveEToolsMonster[];
  }

  if (typeof input.name === "string") return [input as FiveEToolsMonster];

  throw new Error("Could not find a monster array in the 5etools JSON file.");
}
