import { audioPool, corePool, dnd5ePool } from "src/db.js";
import type { PoolConnection } from "mysql2/promise";
import type { DnD5eEntityWriteDB } from "src/api/encounter/entities/dnd5e/types.js";
import {
  insertCoreEntity,
  updateCoreEntity,
} from "src/api/encounter/entities/entityModel.js";
import {
  insertEntity as insertDnd5eEntity,
  updateEntity as updateDnd5eEntity,
} from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import {
  entityImportKey,
  findImportedEntity,
  replaceImportedEntityTags,
  writeEntityProvenance,
  writeImportedEntityTags,
  type EntityProvenanceWrite,
} from "./5eToolsEntityImportRepository.js";
import { transform5eToolsMonster } from "src/utils/5etools/monster-transformer.js";
import type {
  FiveEToolsMonster,
  EntityTagDB,
} from "src/utils/5etools/monster-transformer.js";

export type FiveEToolsImportMode = "insert" | "upsert" | "skip";

export interface FiveEToolsImportOptions {
  mode?: FiveEToolsImportMode;
  continueOnError?: boolean;
  /** Overwrite entities edited in the app (locally_edited = 1) too, which clears the flag. */
  force?: boolean;
}

export interface FiveEToolsImportItemResult {
  name: string;
  source?: string;
  entityId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  reason?: string;
  warnings: string[];
  error?: string;
}

export interface FiveEToolsImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  results: FiveEToolsImportItemResult[];
}

export const ENTITY_SKIP_REASONS = {
  exists: "already imported",
  edited: "edited in the app (use --force to overwrite)",
} as const;

interface WritePayload {
  entity: DnD5eEntityWriteDB;
  tags: EntityTagDB[];
}

// Provenance lives in dnd5e.entities columns; the other tags stay in entity_tags.
const PROVENANCE_TAG_TYPES = new Set(["source", "page"]);
const MAX_PAGE = 65_535;

/**
 * Imports monsters one transaction each. Rows are matched by import_key, so a rename in the app
 * keeps the match. A row edited in the app is skipped unless `force`.
 */
export async function import5eToolsEntities(
  monsters: FiveEToolsMonster[],
  options: FiveEToolsImportOptions = {}
): Promise<FiveEToolsImportResult> {
  const mode = options.mode ?? "upsert";

  const summary: FiveEToolsImportResult = {
    total: monsters.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const monster of monsters) {
    const transformed = transform5eToolsMonster(monster);
    const label = { name: transformed.entity.name, source: transformed.source };
    const warnings = [...transformed.warnings];

    try {
      const provenance = importProvenance(transformed.entity.name, transformed.tags, transformed.page, warnings);
      const payload: WritePayload = {
        entity: transformed.entity,
        tags: transformed.tags.filter(tag => !PROVENANCE_TAG_TYPES.has(tag.tag_type)),
      };
      const connection = await corePool.getConnection();
      await connection.beginTransaction();

      try {
        const existing = await findImportedEntity(connection, provenance.importKey);
        const skipReason = existing && (mode === "skip"
          ? ENTITY_SKIP_REASONS.exists
          : existing.locallyEdited && !options.force ? ENTITY_SKIP_REASONS.edited : undefined);
        if (existing && mode === "insert") {
          throw new Error(`${ENTITY_SKIP_REASONS.exists} (use --mode upsert or skip)`);
        }

        if (existing && skipReason) {
          await connection.rollback();
          connection.release();
          summary.skipped += 1;
          summary.results.push({ ...label, entityId: existing.id, status: "skipped", reason: skipReason, warnings });
          continue;
        }

        const entityId = existing
          ? await updateImportedEntity(connection, existing.id, payload)
          : await insertImportedEntity(connection, payload);
        await writeEntityProvenance(connection, entityId, provenance);

        await connection.commit();
        connection.release();

        const status = existing ? "updated" : "inserted";
        summary[status] += 1;
        summary.results.push({ ...label, entityId, status, warnings });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        ...label,
        status: "failed",
        warnings,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!options.continueOnError) throw error;
    }
  }

  return summary;
}

/** Identity from the stored name and the normalized source tag, as the migration backfill reads them. */
function importProvenance(
  name: string,
  tags: EntityTagDB[],
  page: number | undefined,
  warnings: string[]
): EntityProvenanceWrite {
  const source = tags.find(tag => tag.tag_type === "source")?.tag;
  if (!source) throw new Error("The monster has no source, so it has no import identity.");

  const validPage = page !== undefined && Number.isInteger(page) && page >= 0 && page <= MAX_PAGE;
  if (page !== undefined && !validPage) warnings.push(`page ${page} is not a page number from 0 to ${MAX_PAGE}; stored without one.`);
  return { importKey: entityImportKey(name, source), source, page: validPage ? page : null };
}

export async function close5eToolsImportPools(): Promise<void> {
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

function asModelWriteData(entity: DnD5eEntityWriteDB): DnD5eEntityWriteDB {
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
    // Other child normalizers already return arrays. An omitted upstream sense list clears old senses.
    senses: entity.senses ?? [],
  };
}
