import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { EntityTagDB } from "src/utils/5etools/monster-transformer.js";

// Importer-only SQL for entity identity, provenance and tags.

// Lowercases the ASCII letters A-Z only. toLowerCase() and MySQL LOWER() disagree on some Unicode
// letters (U+0130 becomes "i" + U+0307 in one and "i" in the other), so neither can define the key.
const asciiLower = (value: string): string => value.replace(/[A-Z]/g, letter => letter.toLowerCase());

/**
 * The immutable import identity, 'name|source' with ASCII letters lowercased. The migration
 * 20261120_entity_import_identity.sql builds the same key with byte-wise REPLACE calls.
 */
export const entityImportKey = (name: string, source: string): string =>
  `${asciiLower(name)}|${asciiLower(source)}`;

export interface ImportedEntityRow {
  id: number;
  locallyEdited: boolean;
}

/**
 * The entity imported under this key, with its core row and then its D&D row locked until the
 * transaction ends. That is the order a cascading DELETE of the core row locks them, so the two
 * cannot deadlock. The key is first read without a lock to find the id; if the entity is deleted
 * before the lock is granted, it no longer exists and the import inserts it again.
 */
export async function findImportedEntity(
  connection: PoolConnection,
  importKey: string
): Promise<ImportedEntityRow | undefined> {
  const [found] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM dnd5e.entities WHERE import_key = ?",
    [importKey]
  );
  if (!found[0]) return undefined;
  const id = found[0].id as number;

  const [core] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM core.entities WHERE id = ? FOR UPDATE",
    [id]
  );
  if (!core[0]) return undefined;

  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id, locally_edited FROM dnd5e.entities WHERE id = ? AND import_key = ? FOR UPDATE",
    [id, importKey]
  );
  return rows[0] ? { id, locallyEdited: Boolean(rows[0].locally_edited) } : undefined;
}

export interface EntityProvenanceWrite {
  importKey: string;
  source: string;
  page: number | null;
}

// An import makes the row upstream data again, so it clears locally_edited.
export async function writeEntityProvenance(
  connection: PoolConnection,
  entityId: number,
  provenance: EntityProvenanceWrite
): Promise<void> {
  await connection.execute(
    `UPDATE dnd5e.entities
     SET import_key = ?, source = ?, page = ?, imported_at = CURRENT_TIMESTAMP, locally_edited = 0
     WHERE id = ?`,
    [provenance.importKey, provenance.source, provenance.page, entityId]
  );
}

export async function replaceImportedEntityTags(
  connection: PoolConnection,
  entityId: number,
  tags: EntityTagDB[]
): Promise<void> {
  await connection.execute(`DELETE FROM dnd5e.entity_tags WHERE entity_id = ?`, [entityId]);
  await writeImportedEntityTags(connection, entityId, tags);
}

export async function writeImportedEntityTags(
  connection: PoolConnection,
  entityId: number,
  tags: EntityTagDB[]
): Promise<void> {
  for (const tag of tags) {
    await connection.execute(
      `INSERT IGNORE INTO dnd5e.entity_tags (entity_id, tag_type, tag) VALUES (?, ?, ?)`,
      [entityId, tag.tag_type, tag.tag]
    );
  }
}
