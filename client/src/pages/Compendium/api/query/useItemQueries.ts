import { useMemo } from "react";
import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ITEM_LIMITS,
  ITEM_LIST_LIMITS,
  ITEM_RESOLVE_LIMIT,
  type ItemInput,
  type ItemListParams,
  type ItemRef,
  type ItemResolveResult,
  type ItemSummary,
} from "shared/domain/dnd5e/item.js";
import { ItemApi } from "../itemApi.js";
import { forgetItem, storeItem, type ItemMutationScope } from "./itemCache.js";
import { ITEM_KEYS, type ItemViewer } from "./itemKeys.js";

// Like the rest of the Compendium, item reads never refresh on a timer or on focus. Mutations
// update the cache from the server's answers (see itemCache.ts).

const PAGE_SIZE = ITEM_LIST_LIMITS.defaultLimit;

export type ItemIndexFilters = Omit<ItemListParams, "offset" | "limit">;

/** The browser's list, one server page at a time. A filter change keeps the previous list until the new one arrives. */
export function useItemIndex(viewer: ItemViewer, filters: ItemIndexFilters) {
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: ITEM_KEYS.index(viewer, filters),
    queryFn: ({ pageParam, signal }) => ItemApi.list({ ...filters, offset: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: last => {
      const next = last.offset + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
    staleTime: Infinity,
  });
}

/** One item's page; null data: the item is not available to this viewer. */
export const itemDetailQuery = (viewer: ItemViewer, id: number) => queryOptions({
  queryKey: ITEM_KEYS.detail(viewer, id),
  queryFn: ({ signal }) => ItemApi.get(id, signal),
  staleTime: Infinity,
});

/**
 * An item's page for a link preview in a text, read for the current visit (see ITEM_KEYS.preview),
 * apart from the Items page's own reads. null data: the item is not available to this viewer.
 */
export const itemPreviewQuery = (viewer: ItemViewer, visit: number, id: number) => queryOptions({
  queryKey: ITEM_KEYS.preview(viewer, visit, id),
  queryFn: ({ signal }) => ItemApi.get(id, signal),
  staleTime: Infinity,
});

/** null data: the item is not available to this viewer. */
export function useItem(viewer: ItemViewer, id: number | null) {
  return useQuery({ ...itemDetailQuery(viewer, id ?? 0), enabled: id !== null });
}

/** One key per reference the server answers alike: it trims both parts and ignores the name's case. */
export const itemRefKey = (ref: ItemRef): string =>
  `${ref.name.trim().toLowerCase()}|${ref.source?.trim().toLowerCase() ?? ""}`;

type ResolveBatch = { keys: string[]; refs: ItemRef[] };

const fitsResolveLimits = (ref: ItemRef) =>
  ref.name.trim() !== "" && ref.name.trim().length <= ITEM_LIMITS.name && (ref.source?.trim().length ?? 0) <= ITEM_LIMITS.source;

const resolvedData = (results: UseQueryResult<ItemResolveResult>[]) => results.map(result => result.data);

/**
 * The catalog items that a document's {@item} references name, as this viewer may see them, keyed
 * by itemRefKey. Distinct references go to the server in batches of at most ITEM_RESOLVE_LIMIT.
 * A reference that is hidden, missing, ambiguous or still loading is absent from the map.
 *
 * Batches are read per visit: a new visit (a player's return to the tab showing the document) asks
 * again, and its first render shows no links until the answer arrives, so a link to an item hidden
 * meanwhile is never shown. A batch is dropped as soon as no document shows it (gcTime 0), so a
 * document opened again also asks again.
 */
export function useItemReferences(
  viewer: ItemViewer | null,
  visit: number,
  refs: readonly ItemRef[]
): ReadonlyMap<string, ItemSummary> {
  const batches = useMemo(() => {
    const unique = new Map<string, ItemRef>();
    for (const ref of refs) {
      const key = itemRefKey(ref);
      if (unique.has(key) || !fitsResolveLimits(ref)) continue;
      const source = ref.source?.trim();
      unique.set(key, { name: ref.name.trim(), ...(source ? { source } : {}) });
    }
    const keys = [...unique.keys()].sort();
    const result: ResolveBatch[] = [];
    for (let start = 0; start < keys.length; start += ITEM_RESOLVE_LIMIT) {
      const batchKeys = keys.slice(start, start + ITEM_RESOLVE_LIMIT);
      result.push({ keys: batchKeys, refs: batchKeys.map(key => unique.get(key)!) });
    }
    return result;
  }, [refs]);

  const answers = useQueries({
    queries: viewer
      ? batches.map(batch => ({
        queryKey: ITEM_KEYS.resolve(viewer, visit, batch.keys),
        queryFn: ({ signal }: { signal: AbortSignal }) => ItemApi.resolve(batch.refs, signal),
        staleTime: Infinity,
        gcTime: 0,
      }))
      : [],
    combine: resolvedData,
  });

  return useMemo(() => {
    const resolved = new Map<string, ItemSummary>();
    answers.forEach((answer, index) => {
      const batch = batches[index];
      answer?.results.forEach((result, position) => {
        const key = batch?.keys[position];
        if (key !== undefined && result.item) resolved.set(key, result.item);
      });
    });
    return resolved;
  }, [answers, batches]);
}

/** A family's specifics, a group's members or a pack's contents. */
export function useItemMembers(viewer: ItemViewer, id: number, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ITEM_KEYS.members(viewer, id),
    queryFn: ({ pageParam, signal }) => ItemApi.members(id, { offset: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: last => {
      if (!last) return undefined;
      const next = last.offset + last.members.length;
      return last.members.length > 0 && next < last.total ? next : undefined;
    },
    staleTime: Infinity,
    enabled: options.enabled ?? true,
  });
}

export function useCreateItem(scope: ItemMutationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput) => ItemApi.create(input),
    onSuccess: item => storeItem(queryClient, scope, item),
  });
}

export function useUpdateItem(scope: ItemMutationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ItemInput }) => ItemApi.update(id, input),
    onSuccess: item => storeItem(queryClient, scope, item),
  });
}

export function useSetItemVisibility(scope: ItemMutationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) => ItemApi.setVisibility(id, hidden),
    onSuccess: item => storeItem(queryClient, scope, item),
  });
}

export function useDeleteItem(scope: ItemMutationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ItemApi.remove(id),
    onSuccess: (_result, id) => forgetItem(queryClient, scope, id),
  });
}

/** Results per page of the item picker; "Show more" loads the next page. */
export const ITEM_PICKER_LIMIT = 20;

/**
 * Concrete items whose name or alias matches the search, one page at a time, so every match can be
 * reached. `specifics: false` leaves out generated specifics (a base item cannot be one).
 */
export function useItemPicker(viewer: ItemViewer, query: string, options: { specifics?: false } = {}) {
  const params: ItemIndexFilters = { q: query, kinds: ["concrete"], ...options };
  return useInfiniteQuery({
    placeholderData: keepPreviousData,
    queryKey: ITEM_KEYS.picker(viewer, params),
    queryFn: ({ pageParam, signal }) => ItemApi.list({ ...params, offset: pageParam, limit: ITEM_PICKER_LIMIT }, signal),
    initialPageParam: 0,
    getNextPageParam: last => {
      const next = last.offset + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
    staleTime: Infinity,
    enabled: query !== "",
  });
}
