import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from './keys.js';
import { ENTITY_KEYS } from '../../entities/query/keys.js';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';
import type { DnD5eEncounterState } from 'shared/domain/encounters/dnd5e/encounter.js';

export type EncounterEntityTemplatesById = Record<number, DnD5eEntityDetails>;

/**
 * Get encounter summaries (encounter details + entity summaries)
 */
export function useDnD5eEncounterSummaries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ENCOUNTER_KEYS.summaries(),
    queryFn: () => DnD5eEncounterApi.getEncounterSummaries(),
    enabled: options?.enabled ?? true,
    // An encounter's status changes while it is run, by this client or another one.
    refetchOnMount: "always",
  });
}

/**
 * Fetch entity details for an encounter with smart caching.
 * Only fetches entities that aren't already cached, using a single batch HTTP request.
 * Populates individual entity detail caches for optimal data reuse.
 * 
 * @param encounterId - The encounter ID to fetch entities for
 * @param entityIds - Array of entity IDs to fetch (from encounter state)
 * @param options - Query options (enabled, etc.)
 * @returns Query result with loading states and entity IDs
 */
export function useEncounterEntityTemplates(
  encounterId: number,
  entityIds: number[],
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const normalizedEntityIds = [...new Set(entityIds)].sort((a, b) => a - b);
  
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- queryClient is a stable singleton, not a query dependency
  return useQuery({
    queryKey: [...ENCOUNTER_KEYS.entityTemplates(encounterId), normalizedEntityIds],
    queryFn: async () => {
      // Filter out entities that are already in cache
      const missingEntityIds = normalizedEntityIds.filter(
        entityId => !queryClient.getQueryData(ENTITY_KEYS.template(entityId))
      );
      const templatesById: EncounterEntityTemplatesById = {};
      
      // Only fetch missing entities
      if (missingEntityIds.length > 0) {
        const { default: DnD5eEntityApi } = await import('../../entities/dnd5eEntityApi.js');
        const entities = await DnD5eEntityApi.getEntityTemplatesByIds(missingEntityIds);
        
        // Populate individual entity detail caches for reuse
        entities.forEach(entity => {
          queryClient.setQueryData(ENTITY_KEYS.template(entity.templateId), entity);
        });
      }

      normalizedEntityIds.forEach((entityId) => {
        const entity = queryClient.getQueryData<DnD5eEntityDetails>(
          ENTITY_KEYS.template(entityId)
        );

        if (entity) {
          templatesById[entityId] = entity;
        }
      });

      const missingAfterFetch = normalizedEntityIds.filter(
        (entityId) => !templatesById[entityId]
      );

      if (missingAfterFetch.length > 0) {
        throw new Error(
          `Entity template(s) not found for ID(s): ${missingAfterFetch.join(", ")}`
        );
      }
      
      return templatesById;
    },
    enabled: options?.enabled ?? (!!encounterId && normalizedEntityIds.length > 0),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Read the cached encounter state.
 * The cache has no fetcher: the encounter session writes the state it receives when it joins
 * the encounter's socket room and advances it with the operations the server broadcasts.
 */
export function useDnD5eEncounterState(id: number) {
  return useQuery<{ encounterState: DnD5eEncounterState }>({
    queryKey: ENCOUNTER_KEYS.state(id),
    queryFn: skipToken,
    staleTime: Infinity,
  });
}
