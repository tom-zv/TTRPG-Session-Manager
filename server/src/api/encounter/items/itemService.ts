import type { PoolConnection } from "mysql2/promise";
import { dnd5ePool } from "src/db.js";
import { HttpError, NotFoundError, ValidationError } from "../../HttpErrors.js";
import {
  ITEM_CATEGORIES,
  ITEM_KINDS,
  ITEM_RARITIES,
  itemAliasKey,
  validateItemInput,
  type ItemFacets,
  type ItemInput,
  type ItemMemberRelation,
  type ItemOrigin,
  type ItemRef,
} from "shared/domain/dnd5e/item.js";
import { itemDbToInput, itemInputToDb } from "src/utils/format-transformers/encounter-transformers/dnd5e/item-transformer.js";
import {
  fetchFamilySpecifics,
  fetchItemById,
  fetchItemFacetRows,
  fetchItemPage,
  fetchItemsByNameOrAlias,
  fetchRelationMembers,
  findBaseCandidate,
  insertHomebrewItem,
  isDuplicateEntryError,
  lockItem,
  replaceItemAliases,
  setItemHidden,
  softDeleteItem,
  updateItem as updateItemRow,
  type ItemListFilter,
  type ItemPage,
} from "./itemModel.js";
import type { ItemDB, ItemSummaryDB, ItemViewer } from "./types.js";

const GM: ItemViewer = { isGm: true };

// The same answer for a hidden item (to a player), a deleted one and one that never existed.
const notFound = () => new NotFoundError("Item not found");

const ORIGINS: ItemOrigin[] = ["imported", "homebrew"];
const inOrder = <T>(order: readonly T[], values: Set<T>) => order.filter(value => values.has(value));

export interface ItemListPage {
  rows: ItemSummaryDB[];
  total: number;
  offset: number;
  limit: number;
  facets: ItemFacets;
}

async function listItems(filter: ItemListFilter, viewer: ItemViewer): Promise<ItemListPage> {
  const [{ rows, total }, facetRows] = await inTransaction(async connection => {
    const page = await fetchItemPage(connection, filter, viewer);
    const facets = await fetchItemFacetRows(connection, { q: filter.q, includeSpecifics: filter.includeSpecifics }, viewer);
    return [page, facets] as const;
  }, "readSnapshot");
  const collect = <K extends keyof (typeof facetRows)[number]>(key: K) =>
    new Set(facetRows.map(row => row[key]).filter(value => value !== null));
  return {
    rows,
    total,
    offset: filter.offset,
    limit: filter.limit,
    facets: {
      kinds: inOrder(ITEM_KINDS, collect("kind")),
      categories: inOrder(ITEM_CATEGORIES, collect("category") as Set<(typeof ITEM_CATEGORIES)[number]>),
      origins: inOrder(ORIGINS, collect("origin")),
      rarities: inOrder(ITEM_RARITIES, collect("rarity")),
      sources: [...collect("source")].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    },
  };
}

async function getItem(id: number, viewer: ItemViewer): Promise<ItemDB> {
  return inTransaction(connection => requireItem(connection, id, viewer), "readSnapshot");
}

async function requireItem(connection: PoolConnection, id: number, viewer: ItemViewer): Promise<ItemDB> {
  const item = await fetchItemById(connection, id, viewer);
  if (!item) throw notFound();
  return item;
}

export interface ItemMembersPage {
  relation: ItemMemberRelation | null;
  rows: Array<ItemSummaryDB & { quantity?: number | null }>;
  total: number;
  offset: number;
  limit: number;
}

async function getItemMembers(id: number, viewer: ItemViewer, page: ItemPage): Promise<ItemMembersPage> {
  return inTransaction(async connection => {
    const item = await requireItem(connection, id, viewer);
    if (item.kind === "family") {
      return { relation: "specific", ...(await fetchFamilySpecifics(connection, id, viewer, page)), ...page };
    }
    if (item.kind === "group") {
      return { relation: "group_member", ...(await fetchRelationMembers(connection, id, "group_member", viewer, page)), ...page };
    }
    const contents = await fetchRelationMembers(connection, id, "pack_content", viewer, page);
    // A pack whose contents are all hidden reads like an item without contents.
    return { relation: contents.total > 0 ? "pack_content" : null, ...contents, ...page };
  }, "readSnapshot");
}

/**
 * Each ref resolves to the one visible item it names: by name, else by alias, within its source
 * when it gives one. Several candidates are ambiguous, which reads the same as missing. Only the
 * viewer's own items are candidates, so a player's answer never depends on a hidden item.
 */
async function resolveItems(refs: ItemRef[], viewer: ItemViewer): Promise<Array<{ ref: ItemRef; row: ItemSummaryDB | null }>> {
  const keys = [...new Set(refs.map(ref => itemAliasKey(ref.name)))];
  const { byName, byAlias } = await inTransaction(
    connection => fetchItemsByNameOrAlias(connection, keys, viewer),
    "readSnapshot",
  );
  const only = (rows: ItemSummaryDB[]) => {
    const unique = [...new Map(rows.map(row => [row.id, row])).values()];
    return unique.length === 1 ? unique[0] : null;
  };
  return refs.map(ref => {
    const key = itemAliasKey(ref.name);
    const source = ref.source?.toLowerCase();
    const inSource = (row: ItemSummaryDB) => !source || row.source.toLowerCase() === source;
    const named = byName.filter(row => itemAliasKey(row.name) === key && inSource(row));
    if (named.length > 0) return { ref, row: only(named) };
    return { ref, row: only(byAlias.filter(match => match.key === key && inSource(match.row)).map(match => match.row)) };
  });
}

async function inTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
  mode: "write" | "readSnapshot" = "write",
): Promise<T> {
  const connection = await dnd5ePool.getConnection();
  try {
    if (mode === "readSnapshot") {
      // Pin every query in the response to one InnoDB read view, including alias lookups.
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

// ─── GM writes ────────────────────────────────────────────────────────────────

const identityConflict = (message: string) => new HttpError(409, message);

async function withConflicts<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isDuplicateEntryError(error)) throw identityConflict("The item conflicts with an existing catalog identity.");
    throw error;
  }
}

// A base item is a concrete item that is not itself generated from a family.
async function checkBaseItem(connection: PoolConnection, baseItemId: number, itemId?: number): Promise<void> {
  if (baseItemId === itemId) throw new ValidationError("An item cannot be its own base item.");
  const base = await findBaseCandidate(connection, baseItemId);
  if (!base || base.deleted) throw new ValidationError("The base item does not exist.");
  if (base.kind !== "concrete" || base.hasFamily) {
    throw new ValidationError("A base item must be a concrete item that is not generated from a family.");
  }
}

// Created items are standalone concrete homebrew: no import identity, no family. A duplicate of an
// imported item is created this way too.
async function createItem(input: ItemInput): Promise<ItemDB> {
  return withConflicts(() => inTransaction(async connection => {
    if (input.baseItemId !== undefined) await checkBaseItem(connection, input.baseItemId);
    const itemId = await insertHomebrewItem(connection, itemInputToDb(input));
    await replaceItemAliases(connection, itemId, input.aliases);
    return requireItem(connection, itemId, GM);
  }));
}

// Compares two form snapshots after the shared validator has normalized both.
function sameInput(a: ItemInput, b: ItemInput): boolean {
  const canonical = (input: ItemInput) => {
    const validated = validateItemInput(input);
    return validated.ok ? JSON.stringify({ ...validated.value, aliases: [...validated.value.aliases].sort() }) : null;
  };
  const left = canonical(a);
  return left !== null && left === canonical(b);
}

/**
 * Replaces an item's editable fields. Its role, import identity, family link and stored source
 * record are kept. A change to an imported item marks it locally edited, so imports skip it.
 */
async function updateItem(id: number, input: ItemInput): Promise<ItemDB> {
  return withConflicts(() => inTransaction(async connection => {
    const locked = await lockItem(connection, id);
    if (!locked || locked.deleted) throw notFound();
    const current = await requireItem(connection, id, GM);

    let baseItemId: number | null;
    if (locked.kind !== "concrete") {
      if (input.baseItemId !== undefined) throw new ValidationError("Only concrete items can name a base item.");
      baseItemId = null;
    } else if (locked.family_id !== null) {
      // A generated specific is its family applied to one base printing; that pair is its identity.
      if (input.baseItemId !== undefined && input.baseItemId !== locked.base_item_id) {
        throw identityConflict("A generated item's base printing cannot change. Duplicate it as homebrew instead.");
      }
      baseItemId = locked.base_item_id;
    } else if (input.baseItemId === undefined) {
      // A deleted base never reaches the form, so leaving it out keeps the stored link.
      baseItemId = locked.base_item_id !== null && current.base_name === null ? locked.base_item_id : null;
    } else {
      if (input.baseItemId !== locked.base_item_id) await checkBaseItem(connection, input.baseItemId, id);
      baseItemId = input.baseItemId;
    }

    const next: ItemInput = { ...input, ...(baseItemId !== null ? { baseItemId } : {}) };
    if (baseItemId === null) delete next.baseItemId;
    const stored: ItemInput = { ...itemDbToInput(current) };
    if (locked.base_item_id !== null) stored.baseItemId = locked.base_item_id;
    if (sameInput(next, stored)) return current;

    const locallyEdited = locked.locally_edited || locked.import_key !== null;
    await updateItemRow(connection, id, itemInputToDb(next, locked.details.upstream), locallyEdited);
    await replaceItemAliases(connection, id, next.aliases);
    return requireItem(connection, id, GM);
  }));
}

async function setItemVisibility(id: number, hidden: boolean): Promise<ItemDB> {
  return inTransaction(async connection => {
    const locked = await lockItem(connection, id);
    if (!locked || locked.deleted) throw notFound();
    await setItemHidden(connection, id, hidden);
    return requireItem(connection, id, GM);
  });
}

// Soft deletion. Deleting a family also takes its generated specifics out of every read.
async function deleteItem(id: number): Promise<void> {
  await inTransaction(async connection => {
    const locked = await lockItem(connection, id);
    if (!locked || locked.deleted) throw notFound();
    await softDeleteItem(connection, id);
  });
}

export default {
  listItems,
  getItem,
  getItemMembers,
  resolveItems,
  createItem,
  updateItem,
  setItemVisibility,
  deleteItem,
};
