import type { Dnd5eToolsMonster } from "./types.js";
import { isRecord } from "./primitives.js";

export function parseDnd5eToolsMonsters(input: unknown): Dnd5eToolsMonster[] {
  if (Array.isArray(input)) return input.filter(isRecord) as Dnd5eToolsMonster[];

  if (!isRecord(input)) {
    throw new Error("DnD5eTools import data must be a JSON object or array.");
  }

  for (const key of ["monster", "monsters", "creature", "creatures", "data"]) {
    const value = input[key];
    if (Array.isArray(value)) return value.filter(isRecord) as Dnd5eToolsMonster[];
  }

  if (typeof input.name === "string") return [input as Dnd5eToolsMonster];

  throw new Error("Could not find a monster array in the DnD5eTools JSON file.");
}
