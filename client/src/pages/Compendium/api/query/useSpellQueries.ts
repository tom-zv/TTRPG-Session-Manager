import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Spell, SpellInput, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { SpellApi } from "../spellApi.js";
import { SPELL_KEYS } from "./keys.js";

// The app default is staleTime: Infinity. Spells can be edited by another GM, so let them refresh.
const SPELL_STALE_TIME = 5 * 60 * 1000;

export const spellDetailQuery = (id: number) => ({
  queryKey: SPELL_KEYS.detail(id),
  queryFn: () => SpellApi.getSpell(id),
  staleTime: SPELL_STALE_TIME,
});

export function useSpellIndex(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SPELL_KEYS.index(),
    queryFn: () => SpellApi.getIndex(),
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

// Mutations keep the index and the spell's detail in the cache, so nothing needs a refetch.

const toSummary = (spell: Spell): SpellSummary => ({
  id: spell.id,
  name: spell.name,
  source: spell.source,
  level: spell.level,
  school: spell.school,
  ritual: spell.ritual,
  concentration: spell.concentration,
  castingTime: spell.castingTime,
  castingUnit: spell.castingUnit,
  components: spell.components,
  classes: spell.classes,
  damageTypes: spell.damageTypes,
  saves: spell.saves,
  aliases: spell.aliases,
});

function useStoreSpell() {
  const queryClient = useQueryClient();
  return (spell: Spell) => {
    queryClient.setQueryData<Spell>(SPELL_KEYS.detail(spell.id), spell);
    queryClient.setQueryData<SpellSummary[]>(SPELL_KEYS.index(), old => {
      const summary = toSummary(spell);
      if (!old) return [summary];
      return old.some(existing => existing.id === spell.id)
        ? old.map(existing => (existing.id === spell.id ? summary : existing))
        : [...old, summary];
    });
    // A rename or new alias changes which creatures match.
    void queryClient.invalidateQueries({ queryKey: SPELL_KEYS.casters(spell.id) });
  };
}

export function useCreateSpell() {
  const storeSpell = useStoreSpell();
  return useMutation({
    mutationFn: (input: SpellInput) => SpellApi.createSpell(input),
    onSuccess: storeSpell,
  });
}

export function useUpdateSpell() {
  const storeSpell = useStoreSpell();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SpellInput }) => SpellApi.updateSpell(id, input),
    onSuccess: storeSpell,
  });
}

export function useDeleteSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => SpellApi.deleteSpell(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<SpellSummary[]>(SPELL_KEYS.index(), old => old?.filter(spell => spell.id !== id));
      queryClient.removeQueries({ queryKey: SPELL_KEYS.detail(id) });
      queryClient.removeQueries({ queryKey: SPELL_KEYS.casters(id) });
    },
  });
}
