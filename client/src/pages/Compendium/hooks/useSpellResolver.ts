import { useCallback, useMemo } from "react";
import { buildSpellLookup, resolveSpell, type SpellRef, type SpellSummary } from "shared/domain/dnd5e/spell.js";
import { useSpellIndex } from "../api/query/useSpellQueries.js";

// Resolves spell mentions ({@spell Name|SRC}, monster spell lists) against the spell index.
export function useSpellResolver(options: { enabled?: boolean } = {}) {
  const { data: spells, isLoading } = useSpellIndex(options);
  const lookup = useMemo(() => buildSpellLookup(spells ?? []), [spells]);
  const resolve = useCallback((ref: SpellRef): SpellSummary | undefined => resolveSpell(lookup, ref), [lookup]);
  return { resolve, isLoading };
}
