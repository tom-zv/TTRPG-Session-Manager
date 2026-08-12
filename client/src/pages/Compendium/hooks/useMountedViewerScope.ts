import { useLayoutEffect, useMemo, useRef } from "react";
import type { ItemMutationScope } from "../api/query/itemCache.js";
import type { ItemViewer } from "../api/query/itemKeys.js";

/**
 * The viewer a browser was mounted for, and whether it still is. The Compendium keys each browser
 * by viewer (account and role), so a browser unmounts when the viewer changes, and a write that
 * answers after that must not touch the cache. Mutation callbacks check `isCurrent()`.
 */
export function useMountedViewerScope(viewer: ItemViewer): ItemMutationScope {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useMemo(() => ({ viewer, isCurrent: () => mounted.current }), [viewer]);
}
