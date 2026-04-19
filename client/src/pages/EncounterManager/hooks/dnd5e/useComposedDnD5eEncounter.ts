import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  DnD5eEncounter, 
  DnD5eEncounterSummary 
} from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEntity, DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { 
  useDnD5eEncounterState,
  useEncounterEntityTemplates 
} from "../../api/dnd5e/encounters/query/useDnD5eEncounterQueries.js";
import { ENCOUNTER_KEYS } from "../../api/dnd5e/encounters/query/keys.js";
import { ENTITY_KEYS } from "../../api/dnd5e/entities/query/keys.js";

/**
 * Compose DnD5e encounter from caches
 * Fetches and combines: encounter details, encounter state, and entity details + state
 * 
 */
export function useComposedDnD5eEncounter(encounterId: number) {
  const queryClient = useQueryClient();
  
  // Get encounter state 
  const { data, isLoading: stateLoading } = useDnD5eEncounterState(encounterId);
  const encounterState = data?.encounterState;
  
  // Extract entity IDs from state
  const entityIds = useMemo(() => {
    if (!encounterState) {
      return [];
    }

    return [...new Set(encounterState.entityStates.map((entityState) => entityState.templateId))];
  }, [encounterState]);
  
  // Batch fetch missing entity details in a single query
  // Only fetches entities not already in cache
  const { 
    isLoading: entitiesLoading 
  } = useEncounterEntityTemplates(encounterId, entityIds, { 
    enabled: !!encounterState && entityIds.length > 0
  });
  
  // Get encounter details from summaries cache
  const encounterDetails = useMemo(() => {
    const summaries = queryClient.getQueryData<DnD5eEncounterSummary[]>(
      ENCOUNTER_KEYS.summaries()
    );
    return summaries?.find(e => e.id === encounterId);
  }, [encounterId, queryClient]);
  
  // Compose full encounter from caches 
  const encounter = useMemo(() => {
    if (!encounterDetails || !encounterState || entitiesLoading) {
      return null;
    }

    const entities = encounterState.entityStates.map((entityState) => {
      const entityDetails = queryClient.getQueryData<DnD5eEntityDetails>(
        ENTITY_KEYS.template(entityState.templateId)
      );
      
      if (!entityDetails) {
        console.error(
          `Entity template not found in cache for ID: ${entityState.templateId}. ` +
          `This indicates a cache synchronization issue.`
        );
        return null;
      }
      
      return {
        ...entityDetails,
        ...entityState,
      } as DnD5eEntity;
    }).filter((entity): entity is DnD5eEntity => entity !== null);

    // Compose full encounter object 
    const { entityStates, ...stateWithoutEntityStates } = encounterState;
    void entityStates; // Acknowledge unused var
    
    return {
      ...encounterDetails,
      ...stateWithoutEntityStates,
      entities,
    } as DnD5eEncounter;
  }, [encounterDetails, encounterState, entitiesLoading, queryClient]);
  
  return {
    encounter,
    isLoading: stateLoading || !encounterDetails || entitiesLoading,
  };
}
