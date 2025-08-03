import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DnD5eEntityApi from './entityApi.js';
import type { DnD5eEntity } from 'shared/domain/encounters/dnd5e/entity.js';
import type { CreateEntityRequest, UpdateEntityRequest } from '../../entityApi.js';

// Query keys
const ENTITY_KEYS = {
  all: ['entities', 'dnd5e'] as const,
  summaries: () => [...ENTITY_KEYS.all, 'list'] as const,
  summary: (filters: unknown) => [...ENTITY_KEYS.summaries(), { filters }] as const,
  details: () => [...ENTITY_KEYS.all, 'detail'] as const,
  detail: (id: number) => [...ENTITY_KEYS.details(), id] as const,
};

// Query Hooks
export function useDnD5eEntities() {
  return useQuery({
    queryKey: ENTITY_KEYS.summaries(),
    queryFn: () => DnD5eEntityApi.getAllEntities(),
  });
}

export function useDnD5eEntity(id: number) {
  return useQuery({
    queryKey: ENTITY_KEYS.detail(id),
    queryFn: () => DnD5eEntityApi.getEntityById(id),
    enabled: !!id, 
  });
}

// Mutation Hooks
export function useCreateDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEntity: CreateEntityRequest<DnD5eEntity>) => 
      DnD5eEntityApi.createEntity(newEntity),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENTITY_KEYS.summaries(),
      });
    },
  });
}

export function useUpdateDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateEntityRequest<DnD5eEntity> }) => 
      DnD5eEntityApi.updateEntity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENTITY_KEYS.summaries(),
      });
    },
  });
}

export function useDeleteDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => DnD5eEntityApi.deleteEntity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENTITY_KEYS.summaries(),
      });
    },
  });
}