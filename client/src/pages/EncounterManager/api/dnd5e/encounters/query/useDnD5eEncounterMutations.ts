import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { 
  DnD5eEncounterState,
  DnD5eEncounterDetails
} from 'shared/domain/encounters/dnd5e/encounter.js';
import type { CreatePayload, UpdatePayload } from 'src/pages/EncounterManager/types.js';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from "./keys.js";

export function useCreateDnD5eEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newEncounter: CreatePayload<DnD5eEncounterDetails>) => 
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
    mutationFn: ({ id, data }: { id: number; data: UpdatePayload<DnD5eEncounterDetails> }) => 
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

export function useSaveEncounterState() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      id, 
      encounterState, 
      snapshotType = 'active' 
    }: { 
      id: number; 
      encounterState: DnD5eEncounterState; 
      snapshotType?: 'initial' | 'active' 
    }) => DnD5eEncounterApi.saveEncounterState(id, encounterState, snapshotType),
    onSuccess: (_, { id }) => {
      // Invalidate all state queries for this encounter
      queryClient.invalidateQueries({
        queryKey: ENCOUNTER_KEYS.state(id),
      });
    },
  });
}