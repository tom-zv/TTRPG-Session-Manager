import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DnD5eInventoryItem } from "shared/domain/encounters/dnd5e/inventory.js";
import { InventoryApi } from "../inventoryApi.js";
import { INVENTORY_KEYS } from "./inventoryKeys.js";

/** null data means this viewer has no inventory for the entity (ineligible, missing or unassigned). */
export function useInventory(viewerId: number, entityId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVENTORY_KEYS.detail(viewerId, entityId),
    queryFn: ({ signal }) => InventoryApi.getInventory(entityId, signal),
    staleTime: Infinity,
    enabled: options.enabled ?? true,
  });
}

/** Replace an inventory; the server's answer becomes this viewer's cached copy. */
export function useSaveInventory(viewerId: number, entityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: DnD5eInventoryItem[]) => InventoryApi.saveInventory(entityId, items),
    onSuccess: saved => {
      queryClient.setQueryData(INVENTORY_KEYS.detail(viewerId, entityId), saved);
    },
  });
}
