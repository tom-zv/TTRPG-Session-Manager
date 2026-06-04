import {
  resolveSettings,
  validateSettingsPatch,
  type ResolvedSettings,
  type SettingsPatch,
} from "../settings.js";

/** Per-encounter settings. A DM's saved defaults use the same schema. */
export const ENCOUNTER_SETTINGS = {
  automation: {
    zeroHpTransfer: {
      type: "enum",
      values: ["manual", "auto"],
      defaultValue: "manual",
      label: "Automatically move defeated entities to the grave",
      help: "Applies to future drops to 0 HP. PCs and NPCs using death saves stay in initiative.",
    },
  },
  // Future visibility settings belong here, backed by server-side player views.
} as const;

/** Per-entity-template settings, shared by every copy of the entity. */
export const ENTITY_SETTINGS = {
  combat: {
    deathSaves: {
      type: "boolean",
      defaultValue: false,
      label: "Use death saves",
      help: "Changes this NPC everywhere, including existing encounters.",
    },
  },
} as const;

export type EncounterSettings = ResolvedSettings<typeof ENCOUNTER_SETTINGS>;
export type EncounterSettingsPatch = SettingsPatch<typeof ENCOUNTER_SETTINGS>;
/** Stored sparsely; an absent value means the default. */
export type EntitySettings = SettingsPatch<typeof ENTITY_SETTINGS>;

export const validateEncounterSettingsPatch = (value: unknown): EncounterSettingsPatch =>
  validateSettingsPatch(ENCOUNTER_SETTINGS, value);

export const validateEntitySettingsPatch = (value: unknown): EntitySettings =>
  validateSettingsPatch(ENTITY_SETTINGS, value);

export const resolveEncounterSettings = (value?: unknown): EncounterSettings =>
  resolveSettings(ENCOUNTER_SETTINGS, value);

/** PCs always use death saves, NPCs when enabled, creatures never. */
export function usesDeathSaves(entity: { role: string; settings?: EntitySettings }): boolean {
  return entity.role === "pc" || (entity.role === "npc" && entity.settings?.combat?.deathSaves === true);
}
