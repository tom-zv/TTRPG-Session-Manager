import { isFeaturedNpc, type EntitySettings } from "./settings.js";

/**
 * A manual record of what a template carries. Order is the GM's; names may repeat
 * (two "Healing potion" rows with different notes are fine).
 */
export type DnD5eInventoryItem = {
  name: string;
  quantity: number;
  notes?: string;
};

/** GET and PUT /api/dnd5e/entities/:id/inventory share this body. */
export type DnD5eInventory = { items: DnD5eInventoryItem[] };

export const INVENTORY_LIMITS = { items: 500, name: 128, notes: 2000 } as const;

/** Only player characters and featured NPCs keep an inventory. Other templates retain stored items but show none. */
export function hasInventory(entity: { role: string; settings?: EntitySettings }): boolean {
  return entity.role === "pc" || isFeaturedNpc(entity);
}

/**
 * Validates a whole replacement list and returns it normalized: names and notes trimmed, blank
 * notes dropped. Throws an Error naming the first bad row, so nothing is written on a bad list.
 */
export function validateInventory(value: unknown): DnD5eInventoryItem[] {
  if (!Array.isArray(value)) throw new Error("items must be an array");
  if (value.length > INVENTORY_LIMITS.items) throw new Error(`An inventory holds at most ${INVENTORY_LIMITS.items} items`);

  return value.map((raw: unknown, index) => {
    const row = `Item ${index + 1}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${row} must be an object`);
    const { name, quantity, notes } = raw as Record<string, unknown>;

    if (typeof name !== "string" || name.trim() === "") throw new Error(`${row} needs a name`);
    const trimmedName = name.trim();
    if (trimmedName.length > INVENTORY_LIMITS.name) throw new Error(`${row}: name is longer than ${INVENTORY_LIMITS.name} characters`);

    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`${row}: quantity must be a whole number of at least 1`);
    }

    if (notes !== undefined && notes !== null && typeof notes !== "string") throw new Error(`${row}: notes must be text`);
    const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
    if (trimmedNotes.length > INVENTORY_LIMITS.notes) throw new Error(`${row}: notes are longer than ${INVENTORY_LIMITS.notes} characters`);

    return trimmedNotes ? { name: trimmedName, quantity, notes: trimmedNotes } : { name: trimmedName, quantity };
  });
}
