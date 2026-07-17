import { useQuery } from "@tanstack/react-query";
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
