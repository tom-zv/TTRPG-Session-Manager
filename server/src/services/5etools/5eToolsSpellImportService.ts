import { dnd5ePool } from "src/db.js";
import {
  findSpellIdByNameSource,
  insertSpell,
  replaceSpellTags,
  updateSpell,
} from "src/api/encounter/spells/spellModel.js";
import {
  transform5eToolsSpell,
  type FiveEToolsSpell,
  type SpellClassLookup,
} from "src/utils/5etools/spell-transformer.js";
import type { FiveEToolsImportMode } from "./5eToolsEntityImportService.js";

export interface FiveEToolsSpellImportOptions {
  mode?: FiveEToolsImportMode;
  continueOnError?: boolean;
  // Overwrite spells edited in the app (locally_edited = 1) too.
  force?: boolean;
  classLookup?: SpellClassLookup;
}

export interface FiveEToolsSpellImportItemResult {
  name: string;
  source?: string;
  spellId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  reason?: string;
  warnings: string[];
  error?: string;
}

export interface FiveEToolsSpellImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  results: FiveEToolsSpellImportItemResult[];
}

// One transaction per spell. Existing rows (same name + source) keep their id, so references stay valid.
export async function import5eToolsSpells(
  spells: FiveEToolsSpell[],
  options: FiveEToolsSpellImportOptions = {}
): Promise<FiveEToolsSpellImportResult> {
  const mode = options.mode ?? "upsert";
  const summary: FiveEToolsSpellImportResult = {
    total: spells.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const raw of spells) {
    const label = { name: typeof raw.name === "string" ? raw.name : "(unnamed)", source: typeof raw.source === "string" ? raw.source : undefined };

    try {
      const { spell, tags, warnings } = transform5eToolsSpell(raw, options.classLookup);
      const connection = await dnd5ePool.getConnection();

      try {
        await connection.beginTransaction();
        const existing = mode === "insert"
          ? undefined
          : await findSpellIdByNameSource(connection, spell.name, spell.source, { forUpdate: true });

        const skipReason = existing === undefined
          ? undefined
          : mode === "skip"
            ? "already imported"
            : existing.locallyEdited && !options.force
              ? "edited in the app (use --force to overwrite)"
              : undefined;

        if (existing !== undefined && skipReason) {
          await connection.rollback();
          summary.skipped += 1;
          summary.results.push({ ...label, spellId: existing.id, status: "skipped", reason: skipReason, warnings });
          continue;
        }

        let spellId: number;
        if (existing !== undefined) {
          spellId = existing.id;
          await updateSpell(connection, spellId, spell, false);
        } else {
          spellId = await insertSpell(connection, spell);
        }
        await replaceSpellTags(connection, spellId, tags);
        await connection.commit();

        const status = existing !== undefined ? "updated" : "inserted";
        summary[status] += 1;
        summary.results.push({ ...label, spellId, status, warnings });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        ...label,
        status: "failed",
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      });
      if (!options.continueOnError) throw error;
    }
  }

  return summary;
}
