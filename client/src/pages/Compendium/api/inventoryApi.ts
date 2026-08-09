import type { DnD5eInventory, DnD5eInventoryItem } from "shared/domain/encounters/dnd5e/inventory.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

// A template's inventory lives behind its own endpoint; template reads and saves never carry it.
// The server checks eligibility (PC or featured NPC) and, for players, assignment on every request.

async function failWith(response: Response, failure: string): Promise<never> {
  const error = await response.json().catch(() => ({ message: failure }));
  throw new Error(error.message || failure);
}

const url = (entityId: number) => `/api/dnd5e/entities/${entityId}/inventory`;

export const InventoryApi = {
  /** The items, or null when this viewer has no inventory to see for the entity. */
  async getInventory(entityId: number, signal?: AbortSignal): Promise<DnD5eInventoryItem[] | null> {
    const response = await fetch(url(entityId), {
      method: "GET", headers: authenticatedJsonHeaders(), credentials: "include", signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) return failWith(response, "Failed to load the inventory");
    return ((await response.json()) as DnD5eInventory).items;
  },

  /** Replace the whole list (GM). Returns the list as the server stored it. */
  async saveInventory(entityId: number, items: DnD5eInventoryItem[]): Promise<DnD5eInventoryItem[]> {
    const body: DnD5eInventory = { items };
    const response = await fetch(url(entityId), {
      method: "PUT", headers: authenticatedJsonHeaders(), credentials: "include", body: JSON.stringify(body),
    });
    if (!response.ok) return failWith(response, "Failed to save the inventory");
    return ((await response.json()) as DnD5eInventory).items;
  },
};
