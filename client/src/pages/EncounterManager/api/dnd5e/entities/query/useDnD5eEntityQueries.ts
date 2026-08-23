import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DnD5eEntityApi from '../dnd5eEntityApi.js';
import type { CreateEntityRequest, UpdateEntityRequest } from 'shared/domain/encounters/dnd5e/entityValidation.js';
import type { EntitySettings } from 'shared/domain/encounters/dnd5e/settings.js';
import { ENTITY_KEYS } from './keys.js';
import { SPELL_KEYS } from 'src/pages/Compendium/api/query/keys.js';
import { entityTemplateQuery } from '../../../../services/dnd5e/entityTemplateLoader.js';
import {
  updateTemplateCache,
  removeTemplateCache,
  updateEntitySettingsCache,
} from '../../../../services/dnd5e/entityTemplateCache.js';

export function useDnD5eEntity(id: number) {
  const queryClient = useQueryClient();
  return useQuery({ ...entityTemplateQuery(queryClient, id), enabled: !!id });
}

export function useDnD5eEntitySummaries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ENTITY_KEYS.summaries(),
    queryFn: ({ signal }) => DnD5eEntityApi.getEntitySummaries(signal),
    staleTime: Infinity,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateDnD5eEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entity: CreateEntityRequest) => DnD5eEntityApi.createEntity(entity),
    onSuccess: data => {
      updateTemplateCache(queryClient, data.entity);
      void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casterLists() });
    },
  });
}

export function useUpdateDnD5eEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, overwriteImported }: { id: number; data: UpdateEntityRequest; overwriteImported?: true }) =>
      DnD5eEntityApi.updateEntity(id, data, overwriteImported ? { overwriteImported } : {}),
    onSuccess: entity => {
      updateTemplateCache(queryClient, entity);
      void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casterLists() });
    },
  });
}

/** Merges the given settings leaves into a template's settings; other leaves stay as stored. */
export function usePatchDnD5eEntitySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: EntitySettings }) => DnD5eEntityApi.patchSettings(id, patch),
    onSuccess: (settings, { id }) => updateEntitySettingsCache(queryClient, id, settings),
  });
}

export function useDeleteDnD5eEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => DnD5eEntityApi.deleteEntity(id),
    onSuccess: (_, id) => {
      removeTemplateCache(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casterLists() });
    },
  });
}
