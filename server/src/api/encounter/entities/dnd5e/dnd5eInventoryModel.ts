import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { dnd5ePool } from "src/db.js";
import {
  INVENTORY_LIMITS,
  validateInventory,
  type DnD5eInventory,
  type DnD5eInventoryAppend,
  type DnD5eInventoryEntry,
  type DnD5eInventoryItem,
} from "shared/domain/encounters/dnd5e/inventory.js";
import type {
  InventoryAppendResult as EntityInventoryAppendResult,
  InventoryReplaceResult as EntityInventoryReplaceResult,
  InventoryViewer,
} from "../entityModel.js";
import { ASSIGNED_PC_WHERE, HAS_INVENTORY_SQL } from "./dnd5eEntityModel.js";

// ─── Inventory ────────────────────────────────────────────────────────────────
// The JSON column dnd5e.entities.inventory and its counter inventory_revision. They are kept out of
// ENTITY_SELECT and extractDnD5eTableFields: only these functions read or write them, so template
// reads carry no gear and a full template save never replaces it.
//
// Rows may link a dnd5e.items catalog item. Every read adds what the viewer may know of it:
// - a player gets `itemId` and `item` only while the item is visible (not deleted, not hidden,
//   and its family neither), and otherwise just the saved name, quantity and notes;
// - a GM always gets `itemId`, and `item` unless the item (or its family) is deleted. A deleted
//   link stays stored as history and reads as the saved name.
//
// Writes lock the entity row FOR UPDATE, then share-lock the linked catalog rows. Item writers lock
// only catalog rows, so the order cannot deadlock, and appends and replacements on one entity serialize.


const GM: InventoryViewer = { isGm: true, assignedUserId: null };

type CatalogLink = { id: number; name: string; source: string; concrete: boolean; hidden: boolean; deleted: boolean };

type InventoryReplaceResult = EntityInventoryReplaceResult<"dnd5e">;
type InventoryAppendResult = EntityInventoryAppendResult<"dnd5e">;

function readInventoryColumn(value: unknown): DnD5eInventoryItem[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  // Stored lists were validated on write; re-validating keeps a hand-edited row from reaching clients malformed.
  return parsed === null || parsed === undefined ? [] : validateInventory(parsed);
}

// The linked catalog rows, keyed by ID. `lock` share-locks them (and their families) for a write.
async function fetchCatalogLinks(db: PoolConnection, ids: number[], lock: boolean): Promise<Map<number, CatalogLink>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT i.id, i.name, i.source, i.kind,
            (i.is_hidden = 1 OR COALESCE(f.is_hidden, 0) = 1) AS hidden,
            (i.deleted_at IS NOT NULL OR f.deleted_at IS NOT NULL) AS deleted
     FROM dnd5e.items i
     LEFT JOIN dnd5e.items f ON f.id = i.family_id
     WHERE i.id IN (${unique.map(() => "?").join(", ")})${lock ? " FOR SHARE" : ""}`,
    unique
  );
  return new Map(rows.map(row => [row.id as number, {
    id: row.id as number,
    name: row.name as string,
    source: row.source as string,
    concrete: row.kind === "concrete",
    hidden: Boolean(row.hidden),
    deleted: Boolean(row.deleted),
  }]));
}

const linkedIds = (items: DnD5eInventoryItem[]) =>
  items.flatMap(item => (item.itemId === undefined ? [] : [item.itemId]));

function toEntries(items: DnD5eInventoryItem[], links: Map<number, CatalogLink>, viewer: InventoryViewer): DnD5eInventoryEntry[] {
  return items.map(({ itemId, ...row }) => {
    if (itemId === undefined) return row;
    const link = links.get(itemId);
    const available = link !== undefined && !link.deleted;
    if (!viewer.isGm) {
      return available && !link.hidden ? { ...row, itemId, item: { name: link.name, source: link.source } } : row;
    }
    if (!available) return { ...row, itemId };
    return { ...row, itemId, item: { name: link.name, source: link.source, ...(link.hidden ? { hidden: true as const } : {}) } };
  });
}

async function project(db: PoolConnection, items: DnD5eInventoryItem[], revision: number, viewer: InventoryViewer, lock: boolean): Promise<DnD5eInventory> {
  const links = await fetchCatalogLinks(db, linkedIds(items), lock);
  return { items: toEntries(items, links, viewer), revision };
}

async function withConnection<T>(work: (connection: PoolConnection) => Promise<T>, readOnly = false): Promise<T> {
  const connection = await dnd5ePool.getConnection();
  try {
    if (readOnly) {
      // One read view for the list and its catalog rows, so a concurrent hide cannot slip between them.
      await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    } else {
      await connection.beginTransaction();
    }
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * The inventory of an entity that has one, as the viewer may see it, or null when it is missing
 * or ineligible. A player (`assignedUserId`) qualifies only for a player character assigned to them.
 */
export async function getInventory(entityId: number, viewer: InventoryViewer): Promise<DnD5eInventory | null> {
  const where = viewer.assignedUserId === null
    ? `c.id = ? AND ${HAS_INVENTORY_SQL}`
    : `c.id = ? AND ${ASSIGNED_PC_WHERE}`;
  const params = viewer.assignedUserId === null ? [entityId] : [entityId, viewer.assignedUserId];
  return withConnection(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT e.inventory, COALESCE(e.inventory_revision, 0) AS revision
       FROM core.entities c JOIN dnd5e.entities e ON c.id = e.id WHERE ${where}`,
      params
    );
    if (!rows[0]) return null;
    return project(connection, readInventoryColumn(rows[0].inventory), Number(rows[0].revision), viewer, false);
  }, true);
}

// Locks an eligible entity's row and returns its stored list, or null when it is missing or ineligible.
async function lockInventory(connection: PoolConnection, entityId: number): Promise<{ items: DnD5eInventoryItem[]; revision: number } | null> {
  // The lock also keeps a concurrent role or Featured change from slipping between the check and the write.
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT e.inventory, COALESCE(e.inventory_revision, 0) AS revision
     FROM dnd5e.entities e WHERE e.id = ? AND ${HAS_INVENTORY_SQL} FOR UPDATE`,
    [entityId]
  );
  return rows[0] ? { items: readInventoryColumn(rows[0].inventory), revision: Number(rows[0].revision) } : null;
}

async function writeInventory(connection: PoolConnection, entityId: number, items: DnD5eInventoryItem[]): Promise<number> {
  await connection.execute(
    "UPDATE dnd5e.entities SET inventory = ?, inventory_revision = COALESCE(inventory_revision, 0) + 1 WHERE id = ?",
    [JSON.stringify(items), entityId]
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT inventory_revision AS revision FROM dnd5e.entities WHERE id = ?",
    [entityId]
  );
  return Number(rows[0].revision);
}

/**
 * Replace a whole inventory (GM). With `expectedRevision`, only while the stored revision matches;
 * otherwise nothing is written and the result carries the stored list. Each link must name a
 * concrete catalog item that is not deleted, except a deleted one the stored list already links
 * (at most as many times as it does), so an editor round trip keeps its history. Returns null, writing nothing, for a missing or
 * ineligible entity.
 */
export async function replaceInventory(
  entityId: number,
  items: DnD5eInventoryItem[],
  expectedRevision: number | undefined
): Promise<InventoryReplaceResult | null> {
  return withConnection(async connection => {
    const stored = await lockInventory(connection, entityId);
    if (!stored) return null;
    if (expectedRevision !== undefined && expectedRevision !== stored.revision) {
      return { status: "conflict", inventory: await project(connection, stored.items, stored.revision, GM, false) };
    }

    const links = await fetchCatalogLinks(connection, linkedIds(items), true);
    // A deleted item may stay linked only as often as the stored list already links it: rows can be
    // edited, moved or detached, but no new row may link it.
    const historical = new Map<number, number>();
    for (const id of linkedIds(stored.items)) historical.set(id, (historical.get(id) ?? 0) + 1);
    for (const [index, item] of items.entries()) {
      if (item.itemId === undefined) continue;
      const link = links.get(item.itemId);
      if (!link) return { status: "invalidLink", row: index + 1, reason: "unavailable" };
      if (link.deleted) {
        const remaining = historical.get(item.itemId) ?? 0;
        if (remaining === 0) return { status: "invalidLink", row: index + 1, reason: "unavailable" };
        historical.set(item.itemId, remaining - 1);
      }
      if (!link.concrete) return { status: "invalidLink", row: index + 1, reason: "notConcrete" };
    }

    const revision = await writeInventory(connection, entityId, items);
    return { status: "saved", inventory: { items: toEntries(items, links, GM), revision } };
  });
}

/**
 * Append one catalog item to the latest stored list (GM), saved under the item's current name.
 * The item must be concrete and not deleted; hidden items may be given. Returns null for a missing
 * or ineligible entity.
 */
export async function appendInventoryItem(entityId: number, append: DnD5eInventoryAppend): Promise<InventoryAppendResult | null> {
  return withConnection(async connection => {
    const stored = await lockInventory(connection, entityId);
    if (!stored) return null;

    const [item] = (await fetchCatalogLinks(connection, [append.itemId], true)).values();
    if (!item || item.deleted || !item.concrete) return { status: "itemUnavailable" };
    if (stored.items.length >= INVENTORY_LIMITS.items) return { status: "full" };

    const items: DnD5eInventoryItem[] = [
      ...stored.items,
      { name: item.name, quantity: append.quantity, ...(append.notes !== undefined ? { notes: append.notes } : {}), itemId: item.id },
    ];
    const revision = await writeInventory(connection, entityId, items);
    return { status: "saved", inventory: await project(connection, items, revision, GM, true) };
  });
}

export default { getInventory, replaceInventory, appendInventoryItem };
