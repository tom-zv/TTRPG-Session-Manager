// Inventory is scoped to the viewer as well as the entity: a GM and a player may be served
// different answers for the same ID, and one account never reads another's cache.
export const INVENTORY_KEYS = {
  all: ["compendium", "dnd5e", "inventory"] as const,
  user: (userId: number) => [...INVENTORY_KEYS.all, userId] as const,
  detail: (userId: number, entityId: number) => [...INVENTORY_KEYS.user(userId), entityId] as const,
};
