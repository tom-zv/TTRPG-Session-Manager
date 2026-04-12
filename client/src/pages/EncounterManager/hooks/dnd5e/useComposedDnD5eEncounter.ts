import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  DnD5eEncounter, 
  DnD5eEncounterSummary 
} from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEntity, DnD5eEntityDetails, DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";
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
  // Use ref to get stable reference to queryClient for memoization
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const composedEntityCacheRef = useRef<Map<number, ComposedEntityCacheEntry>>(new Map());
  const composedEntityListRef = useRef<DnD5eEntity[]>([]);

  useEffect(() => {
    composedEntityCacheRef.current.clear();
    composedEntityListRef.current = [];
  }, [encounterId]);
  
  // Get encounter state 
  const { data, isLoading: stateLoading } = useDnD5eEncounterState(encounterId);
  const encounterState = data?.encounterState;
  const snapshotType = data?.snapshotType;
  
  // TODO: Use snapshotType to prompt user if active snapshot was loaded
  void snapshotType;
  
  // Extract entity IDs from state
  const entityIds = useMemo(() => {
    return encounterState?.entityStates.map(e => e.templateId) ?? [];
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
    const summaries = queryClientRef.current.getQueryData<DnD5eEncounterSummary[]>(
      ENCOUNTER_KEYS.summaries()
    );
    return summaries?.find(e => e.id === encounterId);
  }, [encounterId]);
  
  // Compose full encounter from caches 
  const encounter = useMemo(() => {
    if (!encounterDetails || !encounterState || entitiesLoading) return null;
    
    const previousCache = composedEntityCacheRef.current;
    const nextCache = new Map<number, ComposedEntityCacheEntry>();
    const composedEntities = encounterState.entityStates.map((entityState) => {
      const entityDetails = queryClientRef.current.getQueryData<DnD5eEntityDetails>(
        ENTITY_KEYS.template(entityState.templateId)
      );
      
      if (!entityDetails) {
        console.error(
          `Entity template not found in cache for ID: ${entityState.templateId}. ` +
          `This indicates a cache synchronization issue.`
        );
        return null;
      }

      const cached = previousCache.get(entityState.instanceId);
      if (cached && cached.detailsRef === entityDetails && cached.stateRef === entityState) {
        nextCache.set(entityState.instanceId, cached);
        return cached.entity;
      }
      
      const mergedEntity = {
        ...entityDetails,
        ...entityState,
      } as DnD5eEntity;
      nextCache.set(entityState.instanceId, {
        entity: mergedEntity,
        detailsRef: entityDetails,
        stateRef: entityState,
      });
      return mergedEntity;
    }).filter((e): e is DnD5eEntity => e !== null);

    const previousEntities = composedEntityListRef.current;
    const isSameEntityOrder =
      previousEntities.length === composedEntities.length &&
      previousEntities.every((entity, index) => entity === composedEntities[index]);
    const stableEntities = isSameEntityOrder ? previousEntities : composedEntities;

    composedEntityCacheRef.current = nextCache;
    if (!isSameEntityOrder) {
      composedEntityListRef.current = composedEntities;
    }
    // Compose full encounter object 
    const { entityStates, ...stateWithoutEntityStates } = encounterState;
    void entityStates; // Acknowledge unused var
    
    return {
      ...encounterDetails,
      ...stateWithoutEntityStates,
      entities: stableEntities,
    } as DnD5eEncounter;
  }, [encounterDetails, encounterState, entitiesLoading]);
  
  return {
    encounter,
    isLoading: stateLoading || !encounterDetails || entitiesLoading,
  };
}

type ComposedEntityCacheEntry = {
  entity: DnD5eEntity;
  detailsRef: DnD5eEntityDetails;
  stateRef: DnD5eEntityState;
};
