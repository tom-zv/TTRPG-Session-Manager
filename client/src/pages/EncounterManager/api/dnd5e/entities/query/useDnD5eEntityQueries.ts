import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DnD5eEntityApi from '../dnd5eEntityApi.js';
import type { DnD5eEntityDetails, DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import type { CreateEntityRequest, UpdateEntityRequest } from '../../../entityApi.js';
import { ENTITY_KEYS } from './keys.js';

// Query Hooks

/**
 * Get a specific entity's details by ID
 */
export function useDnD5eEntity(id: number) {
  return useQuery({
    queryKey: ENTITY_KEYS.template(id),
    queryFn: () => DnD5eEntityApi.getEntityById(id),
    enabled: !!id, 
  });
}

/**
 * Get entity summaries (lightweight for lists)
 */
export function useDnD5eEntitySummaries(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ENTITY_KEYS.summaries(),
    queryFn: () => DnD5eEntityApi.getEntitySummaries(),
    enabled: options?.enabled ?? true,
  });
}

// Mutation Hooks

export function useCreateDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEntity: CreateEntityRequest<DnD5eEntityDetails>) => 
      DnD5eEntityApi.createEntity(newEntity),
    onSuccess: (data) => {
      // Set the new entity details in cache
      queryClient.setQueryData(
        ENTITY_KEYS.template(data.insertId),
        data.entity
      );
      
      // Update summaries list 
      queryClient.setQueryData<DnD5eEntitySummary[]>(
        ENTITY_KEYS.summaries(),
        (old) => {
          const newSummary: DnD5eEntitySummary = {
            templateId: data.entity.templateId,
            name: data.entity.name,
            entityType: data.entity.entityType,
            cr: data.entity.cr,
            hp: data.entity.hp,
          };
          return old ? [...old, newSummary] : [newSummary];
        }
      );
    },
  });
}

export function useUpdateDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateEntityRequest<DnD5eEntityDetails> }) => 
      DnD5eEntityApi.updateEntity(id, data),
    onSuccess: (updatedEntity, variables) => {
      // Update the specific entity in cache
      queryClient.setQueryData(
        ENTITY_KEYS.template(variables.id),
        updatedEntity
      );
      
      // Update the entity in summaries list
      queryClient.setQueryData<DnD5eEntitySummary[]>(
        ENTITY_KEYS.summaries(),
        (old) => {
          if (!old) return [];
          return old.map(summary => {
            if (summary.templateId === variables.id) {
              return {
                templateId: updatedEntity.templateId,
                name: updatedEntity.name,
                entityType: updatedEntity.entityType,
                cr: updatedEntity.cr,
                hp: updatedEntity.hp,
              };
            }
            return summary;
          });
        }
      );
    },
  });
}

export function useDeleteDnD5eEntity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => DnD5eEntityApi.deleteEntity(id),
    onSuccess: (_, deletedId) => {
      // Remove the specific entity from cache
      queryClient.removeQueries({
        queryKey: ENTITY_KEYS.template(deletedId),
      });
      
      // Remove from summaries list
      queryClient.setQueryData<DnD5eEntitySummary[]>(
        ENTITY_KEYS.summaries(),
        (old) => old ? old.filter(summary => summary.templateId !== deletedId) : []
      );
    },
  });
}