import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnD5eEncounterDetails } from 'shared/domain/encounters/dnd5e/encounter.js';
import type { CreatePayload, UpdatePayload } from 'src/pages/EncounterManager/types.js';
import DnD5eEncounterApi from '../dnd5eEncounterApi.js';
import { ENCOUNTER_KEYS } from "./keys.js";

export function useCreateDnD5eEncounter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    // The campaign is explicit: the one the form was opened for, never whichever is selected later.
    mutationFn: ({ campaignId, encounter }: { campaignId: number; encounter: CreatePayload<DnD5eEncounterDetails> }) =>
      DnD5eEncounterApi.createEncounter(campaignId, encounter),
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
