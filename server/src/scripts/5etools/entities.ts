import fs from "node:fs/promises";
import path from "node:path";
import { prepareBestiary, type BestiaryIssue } from "src/utils/5etools/bestiary.js";
import { parse5eToolsMonsters, transform5eToolsMonster } from "src/utils/5etools/monster-transformer.js";
import type { FiveEToolsEntityImportPayload, FiveEToolsMonster } from "src/utils/5etools/types.js";
import {
  COMMON_USAGE,
  indexedFiles,
  printExclusions,
  printList,
  readArgValue,
  type CommonOptions,
  type ImportCommand,
  type RunContext,
} from "./cli.js";

export interface EntityOptions extends CommonOptions {
  file?: string;
  templates?: string;
  checkSpells: boolean;
}

export const entityCommand: ImportCommand<EntityOptions> = {
  usage: `
Usage:
  npm run import:5etools:entities -- [options]
  npm run import:5etools:entities -- --file <bestiary-xmm.json> [options]

Without --file, imports every book in data/bestiary/index.json. All books are read (left-out books
still serve as _copy parents) and copies and templates are resolved across them.

Entities:
  --file <file>            Import one bestiary file. Copies resolve only within it.
  --templates <file>       bestiary/template.json, for --file copies that apply templates.
  --check-spells           List spell references that match no spell in dnd5e.spells
                           (reads the database, also with --dry-run).
${COMMON_USAGE}
`,
  defaults: () => ({ checkSpells: false }),
  parseArg(args, index, options) {
    switch (args[index]) {
      case "--file":
      case "-f": options.file = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--templates": options.templates = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--check-spells": options.checkSpells = true; return index;
      default: return undefined;
    }
  },
  run: runEntityImport,
};

async function runEntityImport(options: EntityOptions, context: RunContext): Promise<boolean> {
  const { monsters: all, templateJson, origin } = await loadMonsters(options, context);
  const prepared = prepareBestiary(all, context.filter, templateJson);

  console.log(`Monsters read: ${all.length} from ${origin}.`);
  printExclusions("monsters", prepared.excluded.map(item => item.reason), options.verbose, prepared.excluded.map(item => item.label));
  console.log(`Copies resolved: ${prepared.copies}; unresolvable: ${prepared.failures.length}.`);
  printIssues(prepared.failures, options.verbose);
  if (prepared.templateFailures.length) {
    console.log(`Templates that cannot be applied: ${prepared.templateFailures.length}.`);
    printIssues(prepared.templateFailures, options.verbose);
  }
  if (options.file && prepared.failures.some(failure => failure.kind === "unresolved")) {
    console.log("Copies of creatures in other books need the full import (run without --file).");
  }

  const monsters = prepared.monsters;
  if (options.dryRun) {
    const transformed = monsters.map(transform5eToolsMonster);
    const warnings = transformed.flatMap(item => item.warnings.map(warning => `warning: ${item.entity.name}: ${warning}`));
    console.log(`Dry run: ${monsters.length} monster(s) would be imported. Warnings: ${warnings.length}.`);
    printList(transformed.map(item => `- ${item.entity.name}${item.source ? ` [${item.source}]` : ""}: ${item.entity.actions?.length ?? 0} action(s), ${item.entity.traits?.length ?? 0} trait(s), ${item.entity.spellcasting?.length ?? 0} spellcasting block(s)`), options.verbose, "monster(s)");
    printList(warnings, options.verbose, "warning(s)");
    if (options.checkSpells) {
      context.usesDatabase();
      await checkSpellReferences(transformed);
    }
    return true;
  }

  context.usesDatabase();
  const { import5eToolsEntities } = await import("src/services/5etools/5eToolsEntityImportService.js");
  const result = await import5eToolsEntities(monsters, { mode: options.mode, continueOnError: options.continueOnError });

  console.log(`Imported ${result.total} monster(s).`);
  console.log(`Inserted: ${result.inserted}; updated: ${result.updated}; skipped: ${result.skipped}; failed: ${result.failed}.`);
  printList(result.results.flatMap(item => item.warnings.map(warning => `warning: ${item.name}: ${warning}`)), options.verbose, "warning(s)");
  for (const failure of result.results.filter(item => item.status === "failed")) {
    console.error(`failed: ${failure.name}: ${failure.error ?? "Unknown error"}`);
  }
  if (options.checkSpells) await checkSpellReferences(monsters.map(transform5eToolsMonster));
  return result.failed === 0;
}

async function loadMonsters(options: EntityOptions, context: RunContext): Promise<{ monsters: FiveEToolsMonster[]; templateJson?: unknown; origin: string }> {
  if (options.file) {
    const filePath = path.resolve(process.cwd(), options.file);
    const monsters = parse5eToolsMonsters(await readJson(filePath));
    const templateJson = options.templates ? await readJson(path.resolve(process.cwd(), options.templates)) : undefined;
    return { monsters, templateJson, origin: filePath };
  }
  const mirror = await context.mirror();
  // Every book: a left-out book can still be the parent of a kept copy.
  const files = await indexedFiles(mirror, "bestiary", () => true);
  const [templateJson, ...contents] = await mirror.readAll(["bestiary/template.json", ...files.map(entry => entry.file)]);
  const monsters = contents.flatMap(parse5eToolsMonsters);
  return { monsters, templateJson, origin: `${files.length} bestiary file(s)` };
}

// Grouped by message pattern, with a few examples each, unless --verbose.
function printIssues(issues: BestiaryIssue[], verbose: boolean): void {
  if (verbose) {
    for (const issue of issues) console.log(`  ${issue.label}: ${issue.message}`);
    return;
  }
  const groups = new Map<string, string[]>();
  for (const issue of issues) {
    const pattern = issue.message.slice(issue.message.indexOf(": ") + 2).replace(/"[^"]*"/g, '"…"').replace(/\S+\|\S+/g, "…");
    groups.set(pattern, [...(groups.get(pattern) ?? []), issue.label]);
  }
  for (const [pattern, labels] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`  ${labels.length} × ${pattern}  e.g. ${labels.slice(0, 3).join(", ")}`);
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

// Spell list entries and inline {@spell} tags that resolve to no imported spell.
async function checkSpellReferences(transformed: FiveEToolsEntityImportPayload[]): Promise<void> {
  const { dnd5ePool } = await import("src/db.js");
  const { fetchSpellRefIndex } = await import("src/api/encounter/spells/spellModel.js");
  const { findUnresolvedSpellRefs } = await import("src/utils/5etools/spell-references.js");

  const spells = await fetchSpellRefIndex(dnd5ePool);
  const unresolved = findUnresolvedSpellRefs(transformed.map(item => item.entity), spells);
  console.log(`Spell check: ${spells.length} spell(s) in the database; ${unresolved.length} unresolved reference(s).`);
  for (const ref of unresolved) {
    const where = ref.entities.slice(0, 3).join(", ") + (ref.entities.length > 3 ? `, +${ref.entities.length - 3} more` : "");
    console.log(`unresolved: ${ref.name}${ref.source ? ` [${ref.source}]` : ""} (${where})`);
  }
}
