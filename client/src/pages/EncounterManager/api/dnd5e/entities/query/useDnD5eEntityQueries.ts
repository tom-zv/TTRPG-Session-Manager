import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DnD5eEntityApi from '../dnd5eEntityApi.js';
import type { CreateEntityRequest, UpdateEntityRequest } from 'shared/domain/encounters/dnd5e/entityValidation.js';
import { ENTITY_KEYS } from './keys.js';
import { SPELL_KEYS } from 'src/pages/Compendium/api/query/keys.js';
import { entityTemplateQuery } from '../../../../services/dnd5e/entityTemplateLoader.js';
import { updateTemplateCache, removeTemplateCache } from '../../../../services/dnd5e/entityTemplateCache.js';

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
    mutationFn: ({ id, data }: { id: number; data: UpdateEntityRequest }) =>
      DnD5eEntityApi.updateEntity(id, data),
    onSuccess: entity => {
      updateTemplateCache(queryClient, entity);
      void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casterLists() });
    },
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
