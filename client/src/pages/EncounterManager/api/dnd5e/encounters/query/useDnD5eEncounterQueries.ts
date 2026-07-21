import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from './keys.js';
import { loadEntityTemplates } from '../../../../services/dnd5e/entityTemplateLoader.js';
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

/** Reuse cached templates; batch missing or explicitly invalidated details. */
export function useEncounterEntityTemplates(
  encounterId: number,
  entityIds: number[],
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const normalizedEntityIds = [...new Set(entityIds)].sort((a, b) => a - b);
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- queryClient is stable, not a query dependency
  return useQuery({
    queryKey: [...ENCOUNTER_KEYS.entityTemplates(encounterId), normalizedEntityIds],
    queryFn: ({ signal }) => loadEntityTemplates(queryClient, normalizedEntityIds, signal),
    enabled: options?.enabled ?? (!!encounterId && normalizedEntityIds.length > 0),
    staleTime: Infinity,
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
