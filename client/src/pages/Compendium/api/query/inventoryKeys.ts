import { ITEM_KEYS, type ItemViewer } from "./itemKeys.js";

// Inventory is scoped to the viewer (account and role) as well as the entity: a GM and a player
// are served different answers for the same ID, even on one account, and no viewer reads another's cache.
export const INVENTORY_KEYS = {
  all: ["compendium", "dnd5e", "inventory"] as const,
  viewer: (viewer: ItemViewer) => [...INVENTORY_KEYS.all, ITEM_KEYS.viewerSegment(viewer)] as const,
  detail: (viewer: ItemViewer, entityId: number) => [...INVENTORY_KEYS.viewer(viewer), entityId] as const,
};
