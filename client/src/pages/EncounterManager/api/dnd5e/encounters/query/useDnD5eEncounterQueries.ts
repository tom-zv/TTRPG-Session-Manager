import { useQuery, useQueryClient } from '@tanstack/react-query';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from './keys.js';
import { ENTITY_KEYS } from '../../entities/query/keys.js';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';

export type EncounterEntityTemplatesById = Record<number, DnD5eEntityDetails>;

/**
 * Get encounter summaries (encounter details + entity summaries)
 */
export function useDnD5eEncounterSummaries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ENCOUNTER_KEYS.summaries(),
    queryFn: () => DnD5eEncounterApi.getEncounterSummaries(),
    enabled: options?.enabled ?? true,
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
 * Get encounter state (encounter state + entity states bundled together)
 */
export function useDnD5eEncounterState(
  id: number,
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- queryClient is stable; the encounter ID is the query dependency
  return useQuery({
    queryKey: ENCOUNTER_KEYS.state(id),
    queryFn: async () => {
      const incoming = await DnD5eEncounterApi.getEncounterState(id);
      const current = queryClient.getQueryData<typeof incoming>(ENCOUNTER_KEYS.state(id));
      return current && current.encounterState.version > incoming.encounterState.version ? current : incoming;
    },
    enabled: options?.enabled ?? !!id,
    
    // Cache configuration for event-based synchronization
    // The cache stays fresh indefinitely since it is manually updated via events
    staleTime: Infinity,
    // Don't refetch on window focus or reconnect - handle sync via socket events
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Keep unused data in cache for 5 minutes
    gcTime: 5 * 60 * 1000,
  });
}
