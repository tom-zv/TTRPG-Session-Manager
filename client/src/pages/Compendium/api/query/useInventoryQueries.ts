import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { DnD5eInventory, DnD5eInventoryAppend, DnD5eInventoryReplacement } from "shared/domain/encounters/dnd5e/inventory.js";
import { InventoryApi, InventoryConflictError } from "../inventoryApi.js";
import type { ItemMutationScope } from "./itemCache.js";
import { INVENTORY_KEYS } from "./inventoryKeys.js";
import type { ItemViewer } from "./itemKeys.js";

type CachedInventory = DnD5eInventory | null;

/**
 * Answers for one inventory can arrive out of order: a read that started before a save or give may
 * finish after it, and two writes may answer in either order. A lower revision never replaces a
 * higher one. At the same revision the later answer wins: the list is the same, and the later
 * answer carries the fresher view of its catalog items (a hide does not move the revision).
 */
const newer = (cached: CachedInventory | undefined, incoming: DnD5eInventory): DnD5eInventory =>
  cached && cached.revision > incoming.revision ? cached : incoming;

/** null data means this viewer has no inventory for the entity (ineligible, missing or unassigned). */
export function useInventory(viewer: ItemViewer, entityId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVENTORY_KEYS.detail(viewer, entityId),
    queryFn: async ({ signal, client, queryKey }) => {
      const fetched = await InventoryApi.getInventory(entityId, signal);
      // Losing access always wins; otherwise keep whichever list is newer.
      return fetched === null ? null : newer(client.getQueryData<CachedInventory>(queryKey), fetched);
    },
    staleTime: Infinity,
    enabled: options.enabled ?? true,
  });
}

// Writes act for the viewer who made them, and only while that viewer is still signed in.
async function cancelReads(queryClient: QueryClient, { viewer, isCurrent }: ItemMutationScope, entityId: number) {
  if (isCurrent()) await queryClient.cancelQueries({ queryKey: INVENTORY_KEYS.detail(viewer, entityId) });
}
function storeAnswer(queryClient: QueryClient, { viewer, isCurrent }: ItemMutationScope, entityId: number, answer: DnD5eInventory) {
  if (!isCurrent()) return;
  queryClient.setQueryData<CachedInventory>(INVENTORY_KEYS.detail(viewer, entityId), cached => newer(cached, answer));
}

/**
 * Replace an inventory (GM); the server's answer becomes this viewer's cached copy. A stale save
 * fails with InventoryConflictError, and the stored inventory it carries replaces the cached copy,
 * so the list behind the editor is current while the editor keeps its draft.
 */
export function useSaveInventory(scope: ItemMutationScope, entityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (replacement: DnD5eInventoryReplacement) => {
      await cancelReads(queryClient, scope, entityId);
      return InventoryApi.saveInventory(entityId, replacement);
    },
    onSuccess: saved => storeAnswer(queryClient, scope, entityId, saved),
    onError: error => {
      if (error instanceof InventoryConflictError) storeAnswer(queryClient, scope, entityId, error.current);
    },
  });
}

/** Give a catalog item to a character (GM); the server's answer becomes that character's cached inventory. */
export function useAppendInventoryItem(scope: ItemMutationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entityId, append }: { entityId: number; append: DnD5eInventoryAppend }) => {
      await cancelReads(queryClient, scope, entityId);
      return InventoryApi.appendItem(entityId, append);
    },
    onSuccess: (saved, { entityId }) => storeAnswer(queryClient, scope, entityId, saved),
  });
}
