import { isPlainObject, mergeSettings, validateSettingsPatch } from "../encounters/settings.js";
import { ENCOUNTER_SETTINGS, type EncounterSettingsPatch } from "../encounters/dnd5e/settings.js";

/** Default encounter settings per game system, applied to newly created encounters. */
const ENCOUNTER_DEFAULT_SCHEMAS = { dnd5e: ENCOUNTER_SETTINGS };

export type EncounterDefaults = { dnd5e?: EncounterSettingsPatch };

export interface UserPreferences {
  [key: string]: unknown;
  encounterDefaults?: EncounterDefaults;
}

export type UserPreferencesPatch = Pick<UserPreferences, "encounterDefaults">;

export function validatePreferencesPatch(value: unknown): UserPreferencesPatch {
  if (!isPlainObject(value)) throw new Error("Preferences must be an object");
  for (const key of Object.keys(value)) {
    if (key !== "encounterDefaults") throw new Error(`Unsupported preference "${key}"`);
  }
  if (value.encounterDefaults === undefined) return {};
  if (!isPlainObject(value.encounterDefaults)) throw new Error("encounterDefaults must be an object");
  for (const [system, patch] of Object.entries(value.encounterDefaults)) {
    if (!Object.hasOwn(ENCOUNTER_DEFAULT_SCHEMAS, system)) throw new Error(`Unsupported system "${system}"`);
    validateSettingsPatch(ENCOUNTER_DEFAULT_SCHEMAS[system as keyof typeof ENCOUNTER_DEFAULT_SCHEMAS], patch);
  }
  return value as UserPreferencesPatch;
}

/** Stores only what the user set; defaults are resolved when an encounter is created. */
export function mergeUserPreferences(current: UserPreferences, patch: UserPreferencesPatch): UserPreferences {
  if (!patch.encounterDefaults) return current;
  const defaults: EncounterDefaults = { ...current.encounterDefaults };
  if (patch.encounterDefaults.dnd5e) {
    defaults.dnd5e = mergeSettings(defaults.dnd5e ?? {}, patch.encounterDefaults.dnd5e);
  }
  return { ...current, encounterDefaults: defaults };
}
