import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { EntityTagDB } from "src/utils/dnd5etools/monster-transformer.js";

// Ingestion-specific lookup;
export async function findExistingImportedEntityId(
  connection: PoolConnection,
  name: string,
  source: string | undefined
): Promise<number | undefined> {
  if (source) {
    const [sourceRows] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id
       FROM core.entities c
       JOIN dnd5e.entities e ON e.id = c.id
       JOIN dnd5e.entity_tags source_tag
         ON source_tag.entity_id = c.id
        AND source_tag.tag_type = 'source'
        AND source_tag.tag = ?
       WHERE c.name = ?
       LIMIT 1`,
      [source, name]
    );

    if (sourceRows.length > 0) return sourceRows[0].id as number;
    return undefined;
  }

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT c.id
     FROM core.entities c
     JOIN dnd5e.entities e ON e.id = c.id
     LEFT JOIN dnd5e.entity_tags source_tag
       ON source_tag.entity_id = c.id
      AND source_tag.tag_type = 'source'
     WHERE c.name = ?
       AND source_tag.entity_id IS NULL
     LIMIT 1`,
    [name]
  );

  return rows.length > 0 ? rows[0].id as number : undefined;
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
