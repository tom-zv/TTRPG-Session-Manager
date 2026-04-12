import { useDnD5eEntitySummaries } from "../api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { useDnD5eEncounterSummaries } from "../api/dnd5e/encounters/query/useDnD5eEncounterQueries.js";
import {
  AnySystemEncounterSummary,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import { AnySystemEntitySummary } from "shared/domain/encounters/coreEntity.js";

export const useDataSummaries = (
  system: SystemType
): {
  entitySummaries: AnySystemEntitySummary[];
  encounterSummaries: AnySystemEncounterSummary[];
} => {
  // Fetch summaries based on the selected system
  // dnd5e
  const { data: dnd5eEntitySummaries } = useDnD5eEntitySummaries({enabled: system === "dnd5e",});
  const { data: dnd5eEncounterSummaries } = useDnD5eEncounterSummaries({enabled: system === "dnd5e",});
  
  switch (system) {
    case "dnd5e":
      return {
        entitySummaries: dnd5eEntitySummaries ?? [],
        encounterSummaries: dnd5eEncounterSummaries ?? [],
      };

    default:
      return { entitySummaries: [], encounterSummaries: [] };
  }
};
