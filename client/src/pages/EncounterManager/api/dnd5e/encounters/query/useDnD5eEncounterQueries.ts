import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from './keys.js';
import { useAuth } from 'src/app/contexts/AuthContext.js';
import { loadEntityTemplates } from '../../../../services/dnd5e/entityTemplateLoader.js';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';
import type { DnD5eEncounterState } from 'shared/domain/encounters/dnd5e/encounter.js';

export type EncounterEntityTemplatesById = Record<number, DnD5eEntityDetails>;

/**
 * One campaign's encounter summaries (encounter details + entity summaries). Keyed by account and
 * campaign, so a list read for one campaign is never drawn for another.
 */
export function useDnD5eEncounterSummaries(campaignId: number | null, options?: { enabled?: boolean }) {
  const userId = useAuth().currentUser?.id;
  return useQuery({
    queryKey: ENCOUNTER_KEYS.campaignSummaries(userId ?? 0, campaignId ?? 0),
    queryFn: ({ signal }) => DnD5eEncounterApi.getEncounterSummaries(campaignId!, signal),
    enabled: (options?.enabled ?? true) && campaignId !== null && userId !== undefined,
    // An encounter's status changes while it is run, by this client or another one.
    refetchOnMount: "always",
  });
}

/** A direct read of one encounter, which fails when it is not part of `campaignId`. */
export function useDnD5eEncounterDetails(campaignId: number, encounterId: number) {
  const userId = useAuth().currentUser?.id;
  return useQuery({
    queryKey: ENCOUNTER_KEYS.details(userId ?? 0, campaignId, encounterId),
    queryFn: ({ signal }) => DnD5eEncounterApi.getEncounterDetails(campaignId, encounterId, signal),
    enabled: userId !== undefined,
    refetchOnMount: "always",
    // A 404 is the answer for an encounter of another campaign, not a transient failure.
    retry: false,
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
