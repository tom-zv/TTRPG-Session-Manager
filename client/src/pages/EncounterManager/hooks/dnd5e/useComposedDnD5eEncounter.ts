import { useMemo } from "react";
import { 
  DnD5eEncounter, 
} from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { 
  useDnD5eEncounterSummaries,
  useDnD5eEncounterState,
  useEncounterEntityTemplates 
} from "../../api/dnd5e/encounters/query/useDnD5eEncounterQueries.js";

/**
 * Compose DnD5e encounter from caches
 * Fetches and combines: encounter details, encounter state, and entity details + state
 * 
 */
export function useComposedDnD5eEncounter(encounterId: number) {
  // Get encounter state 
  const { data, isLoading: stateLoading } = useDnD5eEncounterState(encounterId);
  const encounterState = data?.encounterState;
  const {
    data: encounterSummaries,
    isError: summariesError,
    isLoading: summariesLoading,
  } = useDnD5eEncounterSummaries();
  
  // Extract entity IDs from state
  const entityIds = useMemo(() => {
    if (!encounterState) {
      return [];
    }

    return [...new Set(encounterState.entityStates.map((entityState) => entityState.templateId))]
      .sort((a, b) => a - b);
  }, [encounterState]);
  
  // Batch fetch missing entity details in a single query
  // Only fetches entities not already in cache
  const { 
    data: entityTemplatesById,
    isError: entityTemplatesError,
    isLoading: entitiesLoading,
  } = useEncounterEntityTemplates(encounterId, entityIds, { 
    enabled: !!encounterState && entityIds.length > 0
  });
  
  // Get encounter details from summaries cache
  const encounterDetails = useMemo(() => {
    return encounterSummaries?.find(e => e.id === encounterId);
  }, [encounterId, encounterSummaries]);
  
  // Compose full encounter from caches 
  const encounter = useMemo(() => {
    if (!encounterDetails || !encounterState || entitiesLoading) {
      return null;
    }

    if (entityIds.length > 0 && !entityTemplatesById) {
      return null;
    }

    const missingTemplate = encounterState.entityStates.find(
      (entityState) => !entityTemplatesById?.[entityState.templateId]
    );

    if (missingTemplate) {
      console.error(
        `Entity template not found in cache for ID: ${missingTemplate.templateId}. ` +
        `This indicates a cache synchronization issue.`
      );
      return null;
    }

    const entities = encounterState.entityStates.map((entityState) => {
      const entityDetails = entityTemplatesById![entityState.templateId]!;

      return {
        ...entityDetails,
        ...entityState,
      } as DnD5eEntity;
    });

    // Compose full encounter object 
    const { entityStates, ...stateWithoutEntityStates } = encounterState;
    void entityStates; // Acknowledge unused var
    
    return {
      ...encounterDetails,
      ...stateWithoutEntityStates,
      entities,
    } as DnD5eEncounter;
  }, [encounterDetails, encounterState, entitiesLoading, entityIds.length, entityTemplatesById]);
  
  return {
    encounter,
    isLoading: stateLoading ||
      summariesLoading ||
      (!encounterDetails && !encounterSummaries && !summariesError) ||
      entitiesLoading ||
      (entityIds.length > 0 && !entityTemplatesById && !entityTemplatesError),
  };
}
