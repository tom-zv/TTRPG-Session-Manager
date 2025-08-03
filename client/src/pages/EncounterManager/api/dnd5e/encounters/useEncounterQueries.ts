import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DnD5eEncounterApi from './encounterApi.js';
import type { Dnd5eEncounter } from 'shared/domain/encounters/dnd5e/encounter.js';
import type { CreateEncounterRequest, UpdateEncounterRequest } from '../../encounterApi.js';

// Query keys
const ENCOUNTER_KEYS = {
  all: ['encounters', 'dnd5e'] as const,
  summaries: () => [...ENCOUNTER_KEYS.all, 'list'] as const,
  summary: (filters: unknown) => [...ENCOUNTER_KEYS.summaries(), { filters }] as const,
  details: () => [...ENCOUNTER_KEYS.all, 'detail'] as const,
  detail: (id: number) => [...ENCOUNTER_KEYS.details(), id] as const,
};

// Query Hooks
export function useDnD5eEncounters() {
  return useQuery({
    queryKey: ENCOUNTER_KEYS.summaries(),
    queryFn: () => DnD5eEncounterApi.getAllEncounters(),
  });
}

export function useDnD5eEncounter(id: number) {
  return useQuery({
    queryKey: ENCOUNTER_KEYS.detail(id),
    queryFn: () => DnD5eEncounterApi.getEncounterById(id),
    enabled: !!id, 
  });
}

// Mutation Hooks
export function useCreateDnD5eEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEncounter: CreateEncounterRequest<Dnd5eEncounter>) => 
      DnD5eEncounterApi.createEncounter(newEncounter),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENCOUNTER_KEYS.summaries(),
      });
    },
  });
}

export function useUpdateDnD5eEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateEncounterRequest<Dnd5eEncounter> }) => 
      DnD5eEncounterApi.updateEncounter(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENCOUNTER_KEYS.summaries(),
      });
    },
  });
}

export function useDeleteDnD5eEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => DnD5eEncounterApi.deleteEncounter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENCOUNTER_KEYS.summaries(),
      });
    },
  });
}

// Additional mutation hook specific to encounters
export function useAssignEntitiesToEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ encounterId, entityIds }: { encounterId: number; entityIds: number[] }) => 
      DnD5eEncounterApi.assignEntitiesToEncounter(encounterId, entityIds),
    onSuccess: (_, { encounterId }) => {
      queryClient.invalidateQueries({
        queryKey: ENCOUNTER_KEYS.detail(encounterId),
      });
    },
  });
}