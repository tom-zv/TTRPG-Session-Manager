import { useCallback } from "react";
import {
  buildSpellLookup,
  resolveSpell,
  type SpellLookup,
  type SpellRef,
  type SpellSummary,
} from "shared/domain/dnd5e/spell.js";
import { useSpellIndex } from "../api/query/useSpellQueries.js";

// One lookup per loaded index, shared by every caller (a stat block can hold dozens of spell links).
const lookupCache = new WeakMap<SpellSummary[], SpellLookup<SpellSummary>>();

function lookupFor(spells: SpellSummary[]): SpellLookup<SpellSummary> {
  let lookup = lookupCache.get(spells);
  if (!lookup) {
    lookup = buildSpellLookup(spells);
    lookupCache.set(spells, lookup);
  }
  return lookup;
}

// Resolves spell mentions ({@spell Name|SRC}, monster spell lists) against the spell index.
export function useSpellResolver(options: { enabled?: boolean } = {}) {
  const { data: spells, isLoading, error, refetch, isFetching } = useSpellIndex(options);
  const resolve = useCallback(
    (ref: SpellRef): SpellSummary | undefined => (spells ? resolveSpell(lookupFor(spells), ref) : undefined),
    [spells]
  );
  return { resolve, isLoading, error, retry: refetch, isFetching, hasSpells: (spells?.length ?? 0) > 0 };
}
