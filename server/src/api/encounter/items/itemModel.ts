import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  itemAliasKey,
  type ItemCategory,
  type ItemKind,
  type ItemOrigin,
  type ItemRarity,
  type ItemRelation,
  type StoredItemDetails,
} from "shared/domain/dnd5e/item.js";
import type { ItemDB, ItemLockDB, ItemSummaryDB, ItemViewer, ItemWriteDB } from "./types.js";

type SqlValue = string | number | boolean | null | Array<string | number>;

// ─── Visibility ───────────────────────────────────────────────────────────────
// Every read below filters with these fragments. They hold no input: values are always bound.
// Nobody sees a deleted item, or a specific whose family is deleted. Players also never see a
// hidden item, or a specific whose family is hidden.

function visibleTo(viewer: ItemViewer, item = "i", family = "f"): string {
  const available = `${item}.deleted_at IS NULL AND (${item}.family_id IS NULL OR ${family}.deleted_at IS NULL)`;
  return viewer.isGm
    ? available
    : `${available} AND ${item}.is_hidden = 0 AND (${item}.family_id IS NULL OR ${family}.is_hidden = 0)`;
}

// A base item never has a family (the service enforces it), so its own flags decide.
const baseVisibleTo = (viewer: ItemViewer) =>
  viewer.isGm ? "b.deleted_at IS NULL" : "b.deleted_at IS NULL AND b.is_hidden = 0";

const SUMMARY_COLUMNS = `i.id, i.kind, i.import_key, i.name, i.source, i.category, i.rarity, i.requires_attunement,
  i.attunement_note, i.value_cp, i.weight_lb, i.is_hidden, i.family_id, f.name AS family_name,
  f.source AS family_source, f.is_hidden AS family_hidden, i.base_item_id, b.name AS base_name, b.source AS base_source`;

const fromItems = (viewer: ItemViewer) => `FROM dnd5e.items i
  LEFT JOIN dnd5e.items f ON f.id = i.family_id
  LEFT JOIN dnd5e.items b ON b.id = i.base_item_id AND ${baseVisibleTo(viewer)}`;

const ORDER = "ORDER BY i.name, i.source, i.id";

// mysql2 returns DECIMAL columns as strings.
const decimal = (value: unknown) => (value === null || value === undefined ? null : Number(value));

const mapSummaryRow = (row: RowDataPacket): ItemSummaryDB => ({
  id: row.id as number,
  kind: row.kind as ItemKind,
  import_key: row.import_key as string | null,
  name: row.name as string,
  source: row.source as string,
  category: row.category as ItemCategory | null,
  rarity: row.rarity as ItemRarity,
  requires_attunement: Boolean(row.requires_attunement),
  attunement_note: row.attunement_note as string | null,
  value_cp: decimal(row.value_cp),
  weight_lb: decimal(row.weight_lb),
  is_hidden: Boolean(row.is_hidden),
  family_id: row.family_id as number | null,
  family_name: row.family_name as string | null,
  family_source: row.family_source as string | null,
  family_hidden: Boolean(row.family_hidden),
  base_item_id: row.base_item_id as number | null,
  base_name: row.base_name as string | null,
  base_source: row.base_source as string | null,
  aliases: [],
});

async function withAliases<T extends ItemSummaryDB>(db: PoolConnection, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const [aliases] = await db.query<RowDataPacket[]>(
    "SELECT item_id, alias FROM dnd5e.item_aliases WHERE item_id IN (?) ORDER BY item_id, alias",
    [rows.map(row => row.id)]
  );
  const byItem = new Map<number, string[]>();
  for (const alias of aliases) {
    const list = byItem.get(alias.item_id as number) ?? [];
    list.push(alias.alias as string);
    byItem.set(alias.item_id as number, list);
  }
  for (const row of rows) row.aliases = byItem.get(row.id) ?? [];
  return rows;
}

// ─── Index ────────────────────────────────────────────────────────────────────

/** What a list and its facets have in common: the viewer, the search and whether specifics count. */
export interface ItemListScope {
  q?: string;
  includeSpecifics: boolean;
}

export interface ItemListFilter extends ItemListScope {
  kinds?: ItemKind[];
  categories?: ItemCategory[];
  origins?: ItemOrigin[];
  rarities?: ItemRarity[];
  sources?: string[];
  attunement?: boolean;
  offset: number;
  limit: number;
}

const likeContains = (q: string) => `%${q.replace(/[\\%_]/g, match => `\\${match}`)}%`;

function scopeConditions(scope: ItemListScope, viewer: ItemViewer) {
  const where = [visibleTo(viewer)];
  const values: SqlValue[] = [];
  if (scope.q) {
    where.push("(i.name LIKE ? OR EXISTS (SELECT 1 FROM dnd5e.item_aliases a WHERE a.item_id = i.id AND a.alias LIKE ?))");
    values.push(likeContains(scope.q), likeContains(scope.q));
  }
  if (!scope.includeSpecifics) where.push("i.family_id IS NULL");
  return { where, values };
}

function listConditions(filter: ItemListFilter, viewer: ItemViewer) {
  const { where, values } = scopeConditions(filter, viewer);
  const within = (column: string, list: SqlValue[] | undefined) => {
    if (!list || list.length === 0) return;
    where.push(`${column} IN (?)`);
    values.push(list as Array<string | number>);
  };
  within("i.kind", filter.kinds);
  within("i.category", filter.categories);
  within("i.rarity", filter.rarities);
  within("i.source", filter.sources);
  if (filter.origins?.length === 1) where.push(filter.origins[0] === "homebrew" ? "i.import_key IS NULL" : "i.import_key IS NOT NULL");
  if (filter.attunement !== undefined) {
    where.push("i.requires_attunement = ?");
    values.push(filter.attunement);
  }
  return { where: where.join(" AND "), values };
}

export async function fetchItemPage(
  db: PoolConnection,
  filter: ItemListFilter,
  viewer: ItemViewer
): Promise<{ rows: ItemSummaryDB[]; total: number }> {
  const { where, values } = listConditions(filter, viewer);
  const [[count]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM dnd5e.items i LEFT JOIN dnd5e.items f ON f.id = i.family_id WHERE ${where}`,
    values
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS} ${fromItems(viewer)} WHERE ${where} ${ORDER} LIMIT ? OFFSET ?`,
    [...values, filter.limit, filter.offset]
  );
  return { rows: await withAliases(db, rows.map(mapSummaryRow)), total: Number(count.total) };
}

export interface ItemFacetRow {
  kind: ItemKind;
  category: ItemCategory | null;
  origin: ItemOrigin;
  rarity: ItemRarity;
  source: string;
}

// Distinct filter values among the items in scope, before the filters themselves apply.
export async function fetchItemFacetRows(db: PoolConnection, scope: ItemListScope, viewer: ItemViewer): Promise<ItemFacetRow[]> {
  const { where, values } = scopeConditions(scope, viewer);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT i.kind, i.category, i.import_key IS NULL AS homebrew, i.rarity, i.source
     FROM dnd5e.items i LEFT JOIN dnd5e.items f ON f.id = i.family_id WHERE ${where.join(" AND ")}`,
    values
  );
  return rows.map(row => ({
    kind: row.kind as ItemKind,
    category: row.category as ItemCategory | null,
    origin: row.homebrew ? "homebrew" : "imported",
    rarity: row.rarity as ItemRarity,
    source: row.source as string,
  }));
}

// ─── Detail and members ───────────────────────────────────────────────────────

export async function fetchItemById(db: PoolConnection, id: number, viewer: ItemViewer): Promise<ItemDB | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS}, i.page, i.details, i.locally_edited, i.import_revision
     ${fromItems(viewer)} WHERE i.id = ? AND ${visibleTo(viewer)}`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const [item] = await withAliases(db, [{
    ...mapSummaryRow(row),
    page: row.page as number | null,
    details: row.details as StoredItemDetails,
    locally_edited: Boolean(row.locally_edited),
    import_revision: row.import_revision as string | null,
  }]);
  return item;
}

export interface ItemPage {
  offset: number;
  limit: number;
}

// The family itself must be visible to the viewer; the service checks that first.
export async function fetchFamilySpecifics(
  db: PoolConnection,
  familyId: number,
  viewer: ItemViewer,
  page: ItemPage
): Promise<{ rows: ItemSummaryDB[]; total: number }> {
  const where = `i.family_id = ? AND ${visibleTo(viewer)}`;
  const [[count]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM dnd5e.items i LEFT JOIN dnd5e.items f ON f.id = i.family_id WHERE ${where}`,
    [familyId]
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS} ${fromItems(viewer)} WHERE ${where} ${ORDER} LIMIT ? OFFSET ?`,
    [familyId, page.limit, page.offset]
  );
  return { rows: await withAliases(db, rows.map(mapSummaryRow)), total: Number(count.total) };
}

// Resolved members the viewer can see, in upstream order. Unresolved references are left out.
export async function fetchRelationMembers(
  db: PoolConnection,
  itemId: number,
  relation: ItemRelation,
  viewer: ItemViewer,
  page: ItemPage
): Promise<{ rows: Array<ItemSummaryDB & { quantity: number | null }>; total: number }> {
  const join = "FROM dnd5e.item_relations r JOIN dnd5e.items i ON i.id = r.member_item_id LEFT JOIN dnd5e.items f ON f.id = i.family_id";
  const where = `r.item_id = ? AND r.relation = ? AND ${visibleTo(viewer)}`;
  const [[count]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${join} WHERE ${where}`, [itemId, relation]);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS}, r.quantity ${join}
     LEFT JOIN dnd5e.items b ON b.id = i.base_item_id AND ${baseVisibleTo(viewer)}
     WHERE ${where} ORDER BY r.position LIMIT ? OFFSET ?`,
    [itemId, relation, page.limit, page.offset]
  );
  const members = rows.map(row => ({ ...mapSummaryRow(row), quantity: row.quantity as number | null }));
  return { rows: await withAliases(db, members), total: Number(count.total) };
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Visible items whose name, or one of whose aliases, may match one of the keys (shared
 * itemAliasKey). Name matches come back from the case- and accent-insensitive column collation,
 * so the caller compares keys exactly; alias keys are stored and compared exactly.
 */
export async function fetchItemsByNameOrAlias(
  db: PoolConnection,
  keys: string[],
  viewer: ItemViewer
): Promise<{ byName: ItemSummaryDB[]; byAlias: Array<{ key: string; row: ItemSummaryDB }> }> {
  if (keys.length === 0) return { byName: [], byAlias: [] };
  const [nameRows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS} ${fromItems(viewer)} WHERE i.name IN (?) AND ${visibleTo(viewer)} ${ORDER}`,
    [keys]
  );
  const [aliasRows] = await db.query<RowDataPacket[]>(
    `SELECT ${SUMMARY_COLUMNS}, a.alias_key ${fromItems(viewer)}
     JOIN dnd5e.item_aliases a ON a.item_id = i.id
     WHERE a.alias_key IN (?) AND ${visibleTo(viewer)} ${ORDER}`,
    [keys]
  );
  const byName = await withAliases(db, nameRows.map(mapSummaryRow));
  const aliased = await withAliases(db, aliasRows.map(mapSummaryRow));
  return {
    byName,
    byAlias: aliased.map((row, index) => ({ key: aliasRows[index].alias_key as string, row })),
  };
}

// ─── Writes (GM) ──────────────────────────────────────────────────────────────

/**
 * Locks an item row for a write and reports whether it is deleted, counting a deleted family.
 * Lock order matches the importer: the item first, then a shared lock on its family.
 */
export async function lockItem(db: PoolConnection, id: number): Promise<ItemLockDB | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, kind, import_key, family_id, base_item_id, locally_edited, deleted_at, details
     FROM dnd5e.items WHERE id = ? FOR UPDATE`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  let familyDeleted = false;
  if (row.family_id !== null) {
    const [family] = await db.execute<RowDataPacket[]>(
      "SELECT deleted_at FROM dnd5e.items WHERE id = ? FOR SHARE",
      [row.family_id]
    );
    familyDeleted = family[0]?.deleted_at !== null;
  }
  return {
    id: row.id as number,
    kind: row.kind as ItemKind,
    import_key: row.import_key as string | null,
    family_id: row.family_id as number | null,
    base_item_id: row.base_item_id as number | null,
    locally_edited: Boolean(row.locally_edited),
    deleted: row.deleted_at !== null || familyDeleted,
    details: row.details as StoredItemDetails,
  };
}

/** A prospective base item, share-locked so it cannot be deleted while the link is written. */
export async function findBaseCandidate(
  db: PoolConnection,
  id: number
): Promise<{ kind: ItemKind; hasFamily: boolean; deleted: boolean } | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT kind, family_id, deleted_at FROM dnd5e.items WHERE id = ? FOR SHARE",
    [id]
  );
  return rows[0]
    ? { kind: rows[0].kind as ItemKind, hasFamily: rows[0].family_id !== null, deleted: rows[0].deleted_at !== null }
    : null;
}

const WRITE_COLUMNS = [
  "name", "source", "page", "category", "rarity", "requires_attunement", "attunement_note",
  "value_cp", "weight_lb", "details", "base_item_id",
] as const satisfies ReadonlyArray<keyof ItemWriteDB>;

const writeValues = (item: ItemWriteDB): Array<string | number | boolean | null> =>
  WRITE_COLUMNS.map(column => (column === "details" ? JSON.stringify(item.details) : item[column]));

/** A GM-made item: concrete, with no import identity and no family. */
export async function insertHomebrewItem(db: PoolConnection, item: ItemWriteDB): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.items (kind, ${WRITE_COLUMNS.join(", ")}) VALUES ('concrete', ${WRITE_COLUMNS.map(() => "?").join(", ")})`,
    writeValues(item)
  );
  return result.insertId;
}

export async function updateItem(db: PoolConnection, id: number, item: ItemWriteDB, locallyEdited: boolean): Promise<void> {
  await db.execute(
    `UPDATE dnd5e.items SET ${WRITE_COLUMNS.map(column => `${column} = ?`).join(", ")}, locally_edited = ? WHERE id = ?`,
    [...writeValues(item), locallyEdited, id]
  );
}

export async function replaceItemAliases(db: PoolConnection, itemId: number, aliases: string[]): Promise<void> {
  await db.execute("DELETE FROM dnd5e.item_aliases WHERE item_id = ?", [itemId]);
  if (aliases.length === 0) return;
  await db.query(
    "INSERT INTO dnd5e.item_aliases (item_id, alias, alias_key) VALUES ?",
    [aliases.map(alias => [itemId, alias, itemAliasKey(alias)])]
  );
}

export async function setItemHidden(db: PoolConnection, id: number, hidden: boolean): Promise<void> {
  await db.execute("UPDATE dnd5e.items SET is_hidden = ? WHERE id = ?", [hidden, id]);
}

// Soft deletion keeps the row, its id and its import identity, so a re-import never resurrects it.
export async function softDeleteItem(db: PoolConnection, id: number): Promise<void> {
  await db.execute("UPDATE dnd5e.items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

export const isDuplicateEntryError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
