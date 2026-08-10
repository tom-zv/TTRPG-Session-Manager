import { dnd5ePool } from "src/db.js";
import { itemUid, type ItemKind } from "shared/domain/dnd5e/item.js";
import { refUid, type ItemImportPlan, type ItemImportRecord, type UpstreamItemKind } from "src/utils/dnd5etools/item-transformer.js";
import {
  findImportedItem,
  findImportedItems,
  insertImportedItem,
  listImportedItemReferences,
  refreshImportedFamilyCategory,
  replaceItemAliases,
  replaceItemRelations,
  updateImportedItem,
  type ImportedItemRow,
} from "./dnd5eToolsItemImportRepository.js";
import type { Dnd5eToolsImportMode } from "./dnd5eToolsImportService.js";

export interface Dnd5eToolsItemImportOptions {
  mode?: Dnd5eToolsImportMode;
  continueOnError?: boolean;
  // Overwrite items edited in the app (locally_edited = 1) too. Never un-hides or restores a row.
  force?: boolean;
  /** Upstream commit SHA or input hash, stored in import_revision. */
  revision: string;
}

export interface Dnd5eToolsItemImportItemResult {
  importKey: string;
  name: string;
  source: string;
  upstreamKind: UpstreamItemKind;
  kind: ItemKind;
  itemId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  reason?: string;
  warnings: string[];
  error?: string;
}

export interface Dnd5eToolsItemImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Set when a failure stopped the run (no --continue-on-error); later records were not attempted. */
  stoppedAt?: string;
  results: Dnd5eToolsItemImportItemResult[];
}

export const SKIP_REASONS = {
  deleted: "deleted in the app",
  familyDeleted: "its family was deleted in the app",
  exists: "already imported",
  edited: "edited in the app (use --force to overwrite)",
} as const;

class RecordSkipped extends Error {}

/**
 * Writes a plan from buildItemImportPlan in its dependency order, one transaction per catalog row
 * with its aliases and relations. Rows keep their ids across imports (matched by import_key). Rows
 * missing from the plan are left alone: a partial input never deletes anything.
 */
export async function importDnd5eToolsItems(
  plan: ItemImportPlan,
  options: Dnd5eToolsItemImportOptions
): Promise<Dnd5eToolsItemImportResult> {
  const mode = options.mode ?? "upsert";
  const summary: Dnd5eToolsItemImportResult = { total: plan.records.length, inserted: 0, updated: 0, skipped: 0, failed: 0, results: [] };
  // Cache stable IDs only. Deletion and edit flags are read under locks when needed.
  const known = new Map<string, ImportedItemRow>();
  const lookup = async (connection: Parameters<typeof findImportedItems>[0], keys: string[]) => {
    const missing = keys.filter(key => !known.has(key));
    for (const [key, row] of await findImportedItems(connection, missing)) known.set(key, row);
    return (key: string) => known.get(key);
  };

  const referenceKeys = new Map<string, Set<string>>();
  const indexReference = (uid: string, key: string) => {
    const keys = referenceKeys.get(uid) ?? new Set<string>();
    keys.add(key);
    referenceKeys.set(uid, keys);
  };
  if (plan.records.some(record => record.relations.length)) {
    for (const row of await listImportedItemReferences(dnd5ePool)) {
      const uid = row.importKey.startsWith("specific:")
        ? row.upstreamUid ?? itemUid(row.name, row.source)
        : row.importKey.slice(row.importKey.indexOf(":") + 1);
      indexReference(uid, row.importKey);
      if (row.legacyRef) indexReference(refUid(row.legacyRef), row.importKey);
    }
    for (const record of plan.records) {
      const uid = record.upstreamKind === "specific"
        ? itemUid(record.name, record.source)
        : record.importKey.slice(record.importKey.indexOf(":") + 1);
      indexReference(uid, record.importKey);
    }
  }
  const writtenFamilies: string[] = [];

  for (const record of plan.records) {
    const label = { importKey: record.importKey, name: record.name, source: record.source, upstreamKind: record.upstreamKind, kind: record.kind };
    const warnings = [...record.warnings];
    const connection = await dnd5ePool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await findImportedItem(connection, record.importKey, { lock: "update" });
      if (existing) known.set(record.importKey, existing);

      const family = record.familyKey
        ? await findImportedItem(connection, record.familyKey, { lock: "share" })
        : undefined;
      const skip = (reason: string): never => {
        throw Object.assign(new RecordSkipped(reason), { itemId: existing?.id });
      };
      if (existing?.deleted) skip(SKIP_REASONS.deleted);
      if (family?.deleted) skip(SKIP_REASONS.familyDeleted);
      if (existing && mode === "insert") throw new Error(`${SKIP_REASONS.exists} (use --mode upsert or skip)`);
      if (existing && mode === "skip") skip(SKIP_REASONS.exists);
      if (existing?.locallyEdited && !options.force) skip(SKIP_REASONS.edited);

      const familyId = record.familyKey ? requireParent(record.familyKey, family, "family", "Family") : null;
      const base = record.baseKey ? (await lookup(connection, [record.baseKey]))(record.baseKey) : undefined;
      const baseItemId = resolveBase(record, base, warnings);

      const relationTargets = record.relations.map(relation => {
        const candidates = referenceKeys.get(refUid(relation.memberRef));
        if (candidates?.size === 1) return [...candidates][0];
        warnings.push(candidates?.size
          ? `${relation.memberRef} matches more than one record; kept unlinked.`
          : `${relation.memberRef} is not in the catalog; kept unlinked.`);
        return undefined;
      });
      const members = await lookup(connection, relationTargets.filter((key): key is string => key !== undefined));
      const relations = record.relations.map((relation, index) => {
        const key = relationTargets[index];
        const member = key ? members(key) : undefined;
        if (key && !member) warnings.push(`${relation.memberRef} is not in the catalog; kept unlinked.`);
        return {
          relation: relation.relation,
          position: relation.position,
          memberRef: relation.memberRef,
          memberItemId: member?.id ?? null,
          quantity: relation.quantity ?? null,
        };
      });

      const write = { record, familyId, baseItemId, revision: options.revision };
      let itemId: number;
      if (existing) {
        itemId = existing.id;
        await updateImportedItem(connection, itemId, write);
      } else {
        itemId = await insertImportedItem(connection, write);
      }
      await replaceItemAliases(connection, itemId, record.aliases);
      await replaceItemRelations(connection, itemId, relations);
      await connection.commit();

      known.set(record.importKey, { id: itemId, importKey: record.importKey, kind: record.kind, locallyEdited: false, deleted: false });
      if (record.kind === "family") writtenFamilies.push(record.importKey);
      const status = existing ? "updated" : "inserted";
      summary[status] += 1;
      summary.results.push({ ...label, itemId, status, warnings });
    } catch (error) {
      await connection.rollback();
      if (error instanceof RecordSkipped) {
        summary.skipped += 1;
        const itemId = (error as RecordSkipped & { itemId?: number }).itemId;
        summary.results.push({ ...label, ...(itemId !== undefined ? { itemId } : {}), status: "skipped", reason: error.message, warnings });
        continue;
      }
      summary.failed += 1;
      summary.results.push({ ...label, status: "failed", warnings, error: error instanceof Error ? error.message : String(error) });
      if (!options.continueOnError) {
        summary.stoppedAt = `${record.name}|${record.source}`;
        break;
      }
    } finally {
      connection.release();
    }
  }
  for (const key of writtenFamilies) {
    const connection = await dnd5ePool.getConnection();
    try {
      await connection.beginTransaction();
      await refreshImportedFamilyCategory(connection, key);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw new Error(`Unable to refresh the category for ${key}.`, { cause: error });
    } finally {
      connection.release();
    }
  }
  return summary;
}

function requireParent(key: string, row: ImportedItemRow | undefined, kind: "family", label: string): number {
  if (!row) throw new Error(`${label} ${key} is not in the catalog.`);
  if (row.kind !== kind) throw new Error(`${label} ${key} is a ${row.kind} row, not a ${kind}.`);
  return row.id;
}

// A specific's base must be an imported base item (concrete); a named item's base link is optional.
function resolveBase(record: ItemImportRecord, row: ImportedItemRow | undefined, warnings: string[]): number | null {
  if (!record.baseKey) return null;
  const eligible = row && row.kind === "concrete" && row.importKey.startsWith("base:");
  if (eligible) return row.id;
  const problem = row ? `${record.baseKey} is not a base item` : `${record.baseKey} is not in the catalog`;
  if (record.upstreamKind === "specific") throw new Error(`Base item ${problem}.`);
  warnings.push(`Base item ${problem}; imported without the link.`);
  return null;
}
