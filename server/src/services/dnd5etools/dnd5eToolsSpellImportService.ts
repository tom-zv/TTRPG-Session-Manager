import { dnd5ePool } from "src/db.js";
import {
  findSpellIdByNameSource,
  insertSpell,
  replaceSpellTags,
  updateSpell,
} from "src/api/encounter/spells/spellModel.js";
import {
  transformDnd5eToolsSpell,
  type Dnd5eToolsSpell,
  type SpellClassLookup,
} from "src/utils/dnd5etools/spell-transformer.js";
import type { Dnd5eToolsImportMode } from "./dnd5eToolsImportService.js";

export interface Dnd5eToolsSpellImportOptions {
  mode?: Dnd5eToolsImportMode;
  continueOnError?: boolean;
  // Overwrite spells edited in the app (locally_edited = 1) too.
  force?: boolean;
  classLookup?: SpellClassLookup;
}

export interface Dnd5eToolsSpellImportItemResult {
  name: string;
  source?: string;
  spellId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  reason?: string;
  warnings: string[];
  error?: string;
}

export interface Dnd5eToolsSpellImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  results: Dnd5eToolsSpellImportItemResult[];
}

// One transaction per spell. Existing rows (same name + source) keep their id, so references stay valid.
export async function importDnd5eToolsSpells(
  spells: Dnd5eToolsSpell[],
  options: Dnd5eToolsSpellImportOptions = {}
): Promise<Dnd5eToolsSpellImportResult> {
  const mode = options.mode ?? "upsert";
  const summary: Dnd5eToolsSpellImportResult = {
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
      const { spell, tags, warnings } = transformDnd5eToolsSpell(raw, options.classLookup);
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
