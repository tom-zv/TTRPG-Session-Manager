import { audioPool, corePool, dnd5ePool } from "src/db.js";
import type { PoolConnection } from "mysql2/promise";
import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";
import {
  insertCoreEntity,
  updateCoreEntity,
} from "src/api/encounter/entities/entityModel.js";
import {
  insertEntity as insertDnd5eEntity,
  updateEntity as updateDnd5eEntity,
} from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import {
  findExistingImportedEntityId,
  replaceImportedEntityTags,
  writeImportedEntityTags,
} from "./dnd5eToolsImportRepository.js";
import { transformDnd5eToolsMonster } from "src/utils/dnd5etools/monster-transformer.js";
import type {
  Dnd5eToolsMonster,
  EntityTagDB,
} from "src/utils/dnd5etools/monster-transformer.js";

export type Dnd5eToolsImportMode = "insert" | "upsert" | "skip";

export interface Dnd5eToolsImportOptions {
  mode?: Dnd5eToolsImportMode;
  continueOnError?: boolean;
}

export interface Dnd5eToolsImportItemResult {
  name: string;
  source?: string;
  entityId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  warnings: string[];
  error?: string;
}

export interface Dnd5eToolsImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  results: Dnd5eToolsImportItemResult[];
}

type Dnd5eEntityWriteData = Omit<DnD5eEntityDB, "id" | "created_at">;

interface WritePayload {
  entity: Dnd5eEntityWriteData;
  tags: EntityTagDB[];
}

export async function importDnd5eToolsEntities(
  monsters: Dnd5eToolsMonster[],
  options: Dnd5eToolsImportOptions = {}
): Promise<Dnd5eToolsImportResult> {
  const mode = options.mode ?? "upsert";

  const summary: Dnd5eToolsImportResult = {
    total: monsters.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const monster of monsters) {
    const transformed = transformDnd5eToolsMonster(monster);

    try {
      const connection = await corePool.getConnection();
      await connection.beginTransaction();

      try {
        const existingId = mode === "insert"
          ? undefined
          : await findExistingImportedEntityId(connection, transformed.entity.name, transformed.source);

        if (existingId !== undefined && mode === "skip") {
          await connection.rollback();
          connection.release();
          summary.skipped += 1;
          summary.results.push({
            name: transformed.entity.name,
            source: transformed.source,
            entityId: existingId,
            status: "skipped",
            warnings: transformed.warnings,
          });
          continue;
        }

        const entityId = existingId !== undefined
          ? await updateImportedEntity(connection, existingId, transformed)
          : await insertImportedEntity(connection, transformed);

        await connection.commit();
        connection.release();

        if (existingId !== undefined) {
          summary.updated += 1;
          summary.results.push({
            name: transformed.entity.name,
            source: transformed.source,
            entityId,
            status: "updated",
            warnings: transformed.warnings,
          });
        } else {
          summary.inserted += 1;
          summary.results.push({
            name: transformed.entity.name,
            source: transformed.source,
            entityId,
            status: "inserted",
            warnings: transformed.warnings,
          });
        }
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        name: transformed.entity.name,
        source: transformed.source,
        status: "failed",
        warnings: transformed.warnings,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!options.continueOnError) throw error;
    }
  }

  return summary;
}

export async function closeDnd5eToolsImportPools(): Promise<void> {
  await Promise.all([corePool.end(), dnd5ePool.end(), audioPool.end()]);
}

async function insertImportedEntity(connection: PoolConnection, payload: WritePayload): Promise<number> {
  const entityId = await insertCoreEntity(connection, payload.entity);
  await insertDnd5eEntity(connection, entityId, asModelWriteData(payload.entity));
  await writeImportedEntityTags(connection, entityId, payload.tags);

  return entityId;
}

async function updateImportedEntity(
  connection: PoolConnection,
  entityId: number,
  payload: WritePayload
): Promise<number> {
  await updateCoreEntity(connection, entityId, payload.entity);
  await updateDnd5eEntity(connection, entityId, asModelWriteData(payload.entity));
  await replaceImportedEntityTags(connection, entityId, payload.tags);

  return entityId;
}

function asModelWriteData(entity: Dnd5eEntityWriteData): Dnd5eEntityWriteData {
  return {
    ...entity,
    creature_type: entity.creature_type ?? null,
    type_tags: entity.type_tags ?? null,
    cr: entity.cr ?? null,
    hp_formula: entity.hp_formula ?? null,
    saves: entity.saves ?? null,
    skills: entity.skills ?? null,
    passive_perception: entity.passive_perception ?? null,
    languages: entity.languages ?? null,
    legendary_action_count: entity.legendary_action_count ?? 0,
    legendary_header: entity.legendary_header ?? null,
  } as unknown as Dnd5eEntityWriteData;
}
