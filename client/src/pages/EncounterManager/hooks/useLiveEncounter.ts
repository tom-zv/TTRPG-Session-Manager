import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { DnD5eEncounter, DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { ENCOUNTER_KEYS } from "../api/dnd5e/encounters/query/keys.js";
import { DnD5eEncounterActions } from "../services/dnd5e/DnD5eEncounterActions.js";
import { useComposedDnD5eEncounter } from "./dnd5e/useComposedDnD5eEncounter.js";
import { useGenericLiveEncounter } from "./useGenericLiveEncounter.js";
import { refreshDnD5eEncounterTemplates } from "../services/dnd5e/entityTemplateCache.js";

export type { LiveEncounterConfig } from "./useGenericLiveEncounter.js";

/**
 * System specific encounter session hook
 */
export const useLiveEncounter = (system: SystemType, encounterId: number) => {
  switch (system) {
    case "dnd5e":
      return useGenericLiveEncounter<
        "dnd5e",
        DnD5eEncounter,
        DnD5eEncounterState,
        DnD5eEncounterEvent,
        DnD5eEncounterActions
      >(encounterId, {
        system: "dnd5e",
        queryKeys: ENCOUNTER_KEYS,
        useComposedEncounter: useComposedDnD5eEncounter,
        createActions: DnD5eEncounterActions.create,
        refreshTemplates: refreshDnD5eEncounterTemplates,
      });

    default:
      throw new Error(`Unsupported system type: ${system}`);
  }
};
