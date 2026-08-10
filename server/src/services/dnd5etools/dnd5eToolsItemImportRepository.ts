import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { itemAliasKey, type ItemKind, type ItemRelation } from "shared/domain/dnd5e/item.js";
import type { ItemImportRecord } from "src/utils/dnd5etools/item-transformer.js";

// Importer-only SQL for dnd5e.items. The importer never writes is_hidden or deleted_at: GM
// visibility and deletion survive every import mode.

type Queryable = Pool | PoolConnection;

export interface ImportedItemRow {
  id: number;
  importKey: string;
  kind: ItemKind;
  locallyEdited: boolean;
  deleted: boolean;
}

const toImportedItem = (row: RowDataPacket): ImportedItemRow => ({
  id: row.id as number,
  importKey: row.import_key as string,
  kind: row.kind as ItemKind,
  locallyEdited: Boolean(row.locally_edited),
  deleted: row.deleted_at !== null,
});

export async function findImportedItem(
  db: Queryable,
  importKey: string,
  options: { lock?: "update" | "share" } = {}
): Promise<ImportedItemRow | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, import_key, kind, locally_edited, deleted_at FROM dnd5e.items WHERE import_key = ?${options.lock === "update" ? " FOR UPDATE" : options.lock === "share" ? " FOR SHARE" : ""}`,
    [importKey]
  );
  return rows[0] ? toImportedItem(rows[0]) : undefined;
}

export async function findImportedItems(db: Queryable, importKeys: string[]): Promise<Map<string, ImportedItemRow>> {
  const found = new Map<string, ImportedItemRow>();
  if (importKeys.length === 0) return found;
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id, import_key, kind, locally_edited, deleted_at FROM dnd5e.items WHERE import_key IN (?)",
    [importKeys]
  );
  for (const row of rows) found.set(row.import_key as string, toImportedItem(row));
  return found;
}

export interface ItemImportWrite {
  record: ItemImportRecord;
  familyId: number | null;
  baseItemId: number | null;
  revision: string;
}

const WRITE_COLUMNS = [
  "kind", "name", "source", "page", "category", "rarity", "requires_attunement", "attunement_note",
  "value_cp", "weight_lb", "details", "family_id", "base_item_id", "import_revision",
] as const;

// DECIMAL(15,4)/(12,4): send the exact 4-place text so MySQL never sees a binary float.
const exactDecimal = (value: number | undefined) => value === undefined ? null : value.toFixed(4);

function writeValues({ record, familyId, baseItemId, revision }: ItemImportWrite): Array<string | number | boolean | null> {
  return [
    record.kind,
    record.name,
    record.source,
    record.page ?? null,
    record.category ?? null,
    record.rarity,
    record.requiresAttunement,
    record.attunementNote ?? null,
    exactDecimal(record.valueCp),
    exactDecimal(record.weightLb),
    JSON.stringify(record.details),
    familyId,
    baseItemId,
    revision,
  ];
}

export async function insertImportedItem(db: Queryable, write: ItemImportWrite): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.items (import_key, ${WRITE_COLUMNS.join(", ")}, imported_at)
     VALUES (?, ${WRITE_COLUMNS.map(() => "?").join(", ")}, CURRENT_TIMESTAMP)`,
    [write.record.importKey, ...writeValues(write)]
  );
  return result.insertId;
}

// The import key never changes. An overwrite clears locally_edited: the row is upstream data again.
export async function updateImportedItem(db: Queryable, id: number, write: ItemImportWrite): Promise<void> {
  await db.execute(
    `UPDATE dnd5e.items
     SET ${WRITE_COLUMNS.map(column => `${column} = ?`).join(", ")}, imported_at = CURRENT_TIMESTAMP, locally_edited = 0
     WHERE id = ?`,
    [...writeValues(write), id]
  );
}

export async function replaceItemAliases(db: Queryable, itemId: number, aliases: string[]): Promise<void> {
  await db.execute("DELETE FROM dnd5e.item_aliases WHERE item_id = ?", [itemId]);
  if (aliases.length === 0) return;
  await db.query(
    "INSERT INTO dnd5e.item_aliases (item_id, alias, alias_key) VALUES ?",
    [aliases.map(alias => [itemId, alias, itemAliasKey(alias)])]
  );
}

export interface ItemRelationWrite {
  relation: ItemRelation;
  position: number;
  memberRef: string;
  memberItemId: number | null;
  quantity: number | null;
}

export async function replaceItemRelations(db: Queryable, itemId: number, relations: ItemRelationWrite[]): Promise<void> {
  await db.execute("DELETE FROM dnd5e.item_relations WHERE item_id = ?", [itemId]);
  if (relations.length === 0) return;
  await db.query(
    "INSERT INTO dnd5e.item_relations (item_id, relation, position, member_ref, member_item_id, quantity) VALUES ?",
    [relations.map(relation => [itemId, relation.relation, relation.position, relation.memberRef, relation.memberItemId, relation.quantity])]
  );
}

export async function listImportedItemReferences(db: Queryable) {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT i.import_key, i.name, i.source,
           JSON_UNQUOTE(i.details->'$.upstream.uid') AS upstream_uid, r.member_ref AS legacy_ref
    FROM dnd5e.items i
    LEFT JOIN dnd5e.item_relations r
      ON r.member_item_id = i.id AND i.import_key LIKE 'specific:%' AND i.details->'$.upstream.uid' IS NULL
    WHERE i.import_key IS NOT NULL
  `);
  return rows.map(row => ({
    importKey: row.import_key as string,
    name: row.name as string,
    source: row.source as string,
    upstreamUid: row.upstream_uid as string | null,
    legacyRef: row.legacy_ref as string | null,
  }));
}

export async function refreshImportedFamilyCategory(db: PoolConnection, familyKey: string): Promise<void> {
  const family = await findImportedItem(db, familyKey, { lock: "update" });
  if (!family || family.deleted || family.locallyEdited) return;

  // Specific writers share-lock the family. Read the committed specifics without locking their rows.
  const [rows] = await db.execute<RowDataPacket[]>(`
    SELECT CASE
      WHEN COUNT(*) = COUNT(category) AND COUNT(DISTINCT category) = 1 THEN MIN(category)
      ELSE NULL
    END AS category
    FROM dnd5e.items WHERE family_id = ? AND deleted_at IS NULL
  `, [family.id]);
  await db.execute("UPDATE dnd5e.items SET category = ? WHERE id = ?", [rows[0].category, family.id]);
}
