import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SpellInput, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { SpellApi } from "../spellApi.js";
import { SPELL_KEYS } from "./keys.js";
import { storeSpell } from "./spellCache.js";

const SPELL_STALE_TIME = Infinity;

export const spellDetailQuery = (id: number) => ({
  queryKey: SPELL_KEYS.detail(id),
  queryFn: ({ signal }: { signal: AbortSignal }) => SpellApi.getSpell(id, signal),
  staleTime: SPELL_STALE_TIME,
});

export function useSpellIndex(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SPELL_KEYS.index(),
    queryFn: ({ signal }) => SpellApi.getIndex(signal),
    staleTime: SPELL_STALE_TIME,
    enabled: options.enabled ?? true,
  });
}

export function useSpell(id: number | null) {
  return useQuery({ ...spellDetailQuery(id ?? 0), enabled: id !== null });
}

export function useSpellCasters(id: number | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SPELL_KEYS.casters(id ?? 0),
    queryFn: () => SpellApi.getCasters(id ?? 0),
    staleTime: SPELL_STALE_TIME,
    enabled: id !== null && (options.enabled ?? true),
  });
}

// Mutations update complete indexes and details from authoritative responses.

export function useCreateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SpellInput) => SpellApi.createSpell(input),
    onSuccess: spell => storeSpell(queryClient, spell),
  });
}

export function useUpdateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SpellInput }) => SpellApi.updateSpell(id, input),
    onSuccess: spell => storeSpell(queryClient, spell),
  });
}

export function useDeleteSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => SpellApi.deleteSpell(id),
    onSuccess: (_result, id) => {
      void queryClient.cancelQueries({ queryKey: SPELL_KEYS.index() });
      queryClient.setQueryData<SpellSummary[]>(SPELL_KEYS.index(), old => old?.filter(spell => spell.id !== id));
      if (!queryClient.getQueryData(SPELL_KEYS.index())) {
        void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.index() });
      }
      queryClient.removeQueries({ queryKey: SPELL_KEYS.detail(id) });
      queryClient.removeQueries({ queryKey: SPELL_KEYS.casters(id) });
    },
  });
}
