import type {
  DnD5eInventory,
  DnD5eInventoryAppend,
  DnD5eInventoryConflict,
  DnD5eInventoryReplacement,
} from "shared/domain/encounters/dnd5e/inventory.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

// A template's inventory lives behind its own endpoint; template reads and saves never carry it.
// The server checks eligibility (PC or featured NPC) and, for players, assignment on every request.

async function failWith(response: Response, failure: string): Promise<never> {
  const error = await response.json().catch(() => ({ message: failure }));
  throw new Error(error.message || failure);
}

/** A save whose expected revision was stale. `current` is the stored inventory; nothing was written. */
export class InventoryConflictError extends Error {
  readonly current: DnD5eInventory;

  constructor(conflict: DnD5eInventoryConflict) {
    super(conflict.message);
    this.name = "InventoryConflictError";
    this.current = { items: conflict.items, revision: conflict.revision };
  }
}

const url = (entityId: number) => `/api/dnd5e/entities/${entityId}/inventory`;
const send = (target: string, method: string, body: unknown) =>
  fetch(target, { method, headers: authenticatedJsonHeaders(), credentials: "include", body: JSON.stringify(body) });

export const InventoryApi = {
  /** The inventory, or null when this viewer has no inventory to see for the entity. */
  async getInventory(entityId: number, signal?: AbortSignal): Promise<DnD5eInventory | null> {
    const response = await fetch(url(entityId), {
      method: "GET", headers: authenticatedJsonHeaders(), credentials: "include", signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) return failWith(response, "Failed to load the inventory");
    return (await response.json()) as DnD5eInventory;
  },

  /**
   * Replace the whole list (GM) while the stored revision is still `expectedRevision`. Returns the
   * inventory as the server stored it; throws InventoryConflictError when someone saved first.
   */
  async saveInventory(entityId: number, replacement: DnD5eInventoryReplacement): Promise<DnD5eInventory> {
    const response = await send(url(entityId), "PUT", replacement);
    if (response.status === 409) throw new InventoryConflictError((await response.json()) as DnD5eInventoryConflict);
    if (!response.ok) return failWith(response, "Failed to save the inventory");
    return (await response.json()) as DnD5eInventory;
  },

  /** Add one catalog item to the latest list (GM). The server appends under its own lock. */
  async appendItem(entityId: number, append: DnD5eInventoryAppend): Promise<DnD5eInventory> {
    const response = await send(`${url(entityId)}/items`, "POST", append);
    if (!response.ok) return failWith(response, "Failed to give the item");
    return (await response.json()) as DnD5eInventory;
  },
};
