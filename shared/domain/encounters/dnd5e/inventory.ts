import { ITEM_ID_MAX } from "../../dnd5e/item.js";
import { isFeaturedNpc, type EntitySettings } from "./settings.js";

/**
 * A manual record of what a template carries. Order is the GM's; names may repeat
 * (two "Healing potion" rows with different notes are fine).
 *
 * `itemId` optionally links the row to a dnd5e.items catalog item. `name` stays the saved label:
 * it is what a viewer sees when the item is hidden from them or deleted, so a link never replaces
 * it and a row is never linked by matching names. Rows without `itemId` are plain free text.
 */
export type DnD5eInventoryItem = {
  name: string;
  quantity: number;
  notes?: string;
  itemId?: number;
};

/**
 * GET and PUT /api/dnd5e/entities/:id/inventory answer with this body. `revision` counts the
 * writes to the list (an inventory never written is revision 0); older servers omit it.
 */
export type DnD5eInventory = { items: DnD5eInventoryItem[]; revision?: number };

/**
 * PUT /api/dnd5e/entities/:id/inventory body. With `expectedRevision`, the list replaces the
 * stored one only while the stored revision still matches; without it, it always does.
 */
export type DnD5eInventoryReplacement = { items: DnD5eInventoryItem[]; expectedRevision?: number };

/**
 * POST /api/dnd5e/entities/:id/inventory/items body (GM): append one catalog item to the latest
 * stored list. The row's saved name comes from the catalog item.
 */
export type DnD5eInventoryAppend = { itemId: number; quantity: number; notes?: string };

/** The 409 body for a replacement whose expectedRevision is stale: the stored list, unchanged. */
export type DnD5eInventoryConflict = { message: string; revision: number; items: DnD5eInventoryItem[] };

export const INVENTORY_LIMITS = { items: 500, name: 128, notes: 2000, revision: 4_294_967_295 } as const;

/** Only player characters and featured NPCs keep an inventory. Other templates retain stored items but show none. */
export function hasInventory(entity: { role: string; settings?: EntitySettings }): boolean {
  return entity.role === "pc" || isFeaturedNpc(entity);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Quantity, notes and link rules shared by list rows and appends. Throws an Error starting with `row`.
function validateRowFields(row: string, fields: Record<string, unknown>): Pick<DnD5eInventoryItem, "quantity" | "notes" | "itemId"> {
  const { quantity, notes, itemId } = fields;

  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`${row}: quantity must be a whole number of at least 1`);
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") throw new Error(`${row}: notes must be text`);
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  if (trimmedNotes.length > INVENTORY_LIMITS.notes) throw new Error(`${row}: notes are longer than ${INVENTORY_LIMITS.notes} characters`);

  if (itemId !== undefined && itemId !== null
    && (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId < 1 || itemId > ITEM_ID_MAX)) {
    throw new Error(`${row}: itemId must be a catalog item id`);
  }

  return {
    quantity,
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    ...(typeof itemId === "number" ? { itemId } : {}),
  };
}

/**
 * Validates and projects the legacy free-text inventory used by the current HTTP reader and writer.
 * Catalog links enter the HTTP contract when the server can validate and filter them.
 */
export function validateInventory(value: unknown): DnD5eInventoryItem[] {
  return validateInventoryRows(value, false);
}

/** Validates inventory rows for the linked inventory contract. */
export function validateLinkedInventory(value: unknown): DnD5eInventoryItem[] {
  return validateInventoryRows(value, true);
}

function validateInventoryRows(value: unknown, allowLinks: boolean): DnD5eInventoryItem[] {
  if (!Array.isArray(value)) throw new Error("items must be an array");
  if (value.length > INVENTORY_LIMITS.items) throw new Error(`An inventory holds at most ${INVENTORY_LIMITS.items} items`);

  return value.map((raw: unknown, index) => {
    const row = `Item ${index + 1}`;
    if (!isRecord(raw)) throw new Error(`${row} must be an object`);
    const { name } = raw;

    if (typeof name !== "string" || name.trim() === "") throw new Error(`${row} needs a name`);
    const trimmedName = name.trim();
    if (trimmedName.length > INVENTORY_LIMITS.name) throw new Error(`${row}: name is longer than ${INVENTORY_LIMITS.name} characters`);

    const { quantity, notes, itemId } = validateRowFields(row, allowLinks ? raw : { ...raw, itemId: undefined });
    return {
      name: trimmedName,
      quantity,
      ...(notes !== undefined ? { notes } : {}),
      ...(itemId !== undefined ? { itemId } : {}),
    };
  });
}

/**
 * A PUT's expectedRevision: undefined when omitted (an unconditional replacement), otherwise a
 * whole number of at least 0. Throws an Error on anything else, null included, so a malformed
 * value never turns into an unconditional overwrite.
 */
export function validateExpectedRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > INVENTORY_LIMITS.revision) {
    throw new Error("expectedRevision must be a whole number of at least 0");
  }
  return value;
}

/** Validates an append body and returns it normalized. Throws an Error on a bad body. */
export function validateInventoryAppend(value: unknown): DnD5eInventoryAppend {
  if (!isRecord(value)) throw new Error("The item to add must be an object");
  if (value.itemId === undefined || value.itemId === null) throw new Error("Choose a catalog item to add");
  const { quantity, notes, itemId } = validateRowFields("The item to add", value);
  return { itemId: itemId as number, quantity, ...(notes !== undefined ? { notes } : {}) };
}
