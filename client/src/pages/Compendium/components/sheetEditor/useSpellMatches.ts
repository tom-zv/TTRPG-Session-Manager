import { useMemo } from "react";
import { useSpellIndex } from "../../api/query/useSpellQueries.js";

/** An index entry's name and printing. */
export type SpellMatch = { name: string; source: string };

type SpellMatches = {
  /** Index entries whose name starts with the query, then those that contain it. */
  matches: SpellMatch[];
  /** Index entries named exactly the query (ignoring case); a name in several printings has several. */
  exact: SpellMatch[];
  /** The index is loaded, so an empty `exact` means the index does not know the name. */
  ready: boolean;
};

/**
 * Searches the cached spell index by name: prefix matches first, then names that contain the
 * query, at most `limit` of them. An empty query matches nothing. `enabled: false` leaves the
 * index unread, for a search that is not showing.
 */
export function useSpellMatches(query: string, limit: number, options: { enabled?: boolean } = {}): SpellMatches {
  const index = useSpellIndex({ enabled: options.enabled ?? true });
  const wanted = query.trim().toLowerCase();
  return useMemo(() => {
    const spells = index.data ?? [];
    if (!wanted) return { matches: [], exact: [], ready: index.isSuccess };
    const lower = (spell: { name: string }) => spell.name.toLowerCase();
    const starts = spells.filter(spell => lower(spell).startsWith(wanted));
    const contains = spells.filter(spell => !lower(spell).startsWith(wanted) && lower(spell).includes(wanted));
    return {
      matches: [...starts, ...contains].slice(0, limit).map(spell => ({ name: spell.name, source: spell.source })),
      exact: starts.filter(spell => lower(spell) === wanted).map(spell => ({ name: spell.name, source: spell.source })),
      ready: index.isSuccess,
    };
  }, [index.data, index.isSuccess, wanted, limit]);
}
