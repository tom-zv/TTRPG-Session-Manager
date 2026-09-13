import { useEffect, useState } from "react";
import { ITEM_LIST_LIMITS, type ItemSummary } from "shared/domain/dnd5e/item.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { useItemPicker } from "../../api/query/useItemQueries.js";

/** Wait this long after typing before searching the server, like the Items browser. */
const SEARCH_DELAY_MS = 250;

/**
 * The debounced catalog search behind item pickers: concrete items only, so a magic variant
 * resolves to an exact printing. `text` is what the user typed; the server is asked once typing
 * pauses. `pending` is true from a keystroke until the answer for that text arrives, so a list can
 * hold a "Searching…" row instead of showing the previous answer under a new query. Without a
 * viewer nothing is searched.
 */
export function useItemMatches(
  viewer: ItemViewer | undefined,
  text: string,
  options: { excludeSpecifics?: boolean; excludeId?: number; limit?: number } = {},
) {
  const typed = text.trim().slice(0, ITEM_LIST_LIMITS.query);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const searched = viewer ? query : "";
  const results = useItemPicker(viewer ?? { userId: 0, isGm: false }, searched, options.excludeSpecifics ? { specifics: false } : {});
  const pages = searched ? results.data?.pages ?? [] : [];
  const all: ItemSummary[] = pages.flatMap(page => page.items).filter(item => item.id !== options.excludeId);
  const pending = Boolean(viewer) && typed !== "" && (typed !== query || results.isPlaceholderData || results.isPending);
  return {
    query: searched,
    results,
    items: options.limit === undefined ? all : all.slice(0, options.limit),
    total: pages[0]?.total ?? 0,
    shown: pages.reduce((count, page) => count + page.items.length, 0),
    pending,
  };
}
