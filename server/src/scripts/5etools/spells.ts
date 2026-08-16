import fs from "node:fs/promises";
import path from "node:path";
import {
  buildSpellClassLookup,
  parse5eToolsSpells,
  transform5eToolsSpell,
  type FiveEToolsSpell,
  type SpellClassLookup,
} from "src/utils/5etools/spell-transformer.js";
import {
  COMMON_USAGE,
  indexedFiles,
  parseForce,
  printExclusions,
  printList,
  readArgValue,
  type CommonOptions,
  type ImportCommand,
  type RunContext,
} from "./cli.js";

export interface SpellOptions extends CommonOptions {
  file?: string;
  classes?: string;
}

const CLASS_LOOKUP_FILE = "generated/gendata-spell-source-lookup.json";

export const spellCommand: ImportCommand<SpellOptions> = {
  usage: `
Usage:
  npm run import:5etools:spells -- [options]
  npm run import:5etools:spells -- --file <spells-xphb.json> [--classes <lookup.json>] [options]

Without --file, imports every kept book in data/spells/index.json, with class lists from
data/${CLASS_LOOKUP_FILE}.

Spells:
  --file <file>            Import one spell file.
  --classes <file>         The class lookup for --file (without it, spells have no class lists).
  --force                  Also overwrite spells edited in the app.
${COMMON_USAGE}
`,
  defaults: () => ({}),
  parseArg(args, index, options) {
    switch (args[index]) {
      case "--file":
      case "-f": options.file = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--classes": options.classes = readArgValue(args, index + 1, args[index]); return index + 1;
      default: return parseForce(args, index, options);
    }
  },
  run: runSpellImport,
};

async function runSpellImport(options: SpellOptions, context: RunContext): Promise<boolean> {
  const { spells: all, classLookup, origin } = await loadSpells(options, context);
  if (!classLookup) console.log("No class lookup: spells are imported without class lists.");

  const reasons: string[] = [];
  const labels: string[] = [];
  const spells = all.filter(spell => {
    const reason = context.filter.reject(spell);
    if (reason) {
      reasons.push(reason);
      labels.push(`${String(spell.name)}|${String(spell.source)}`);
    }
    return !reason;
  });
  console.log(`Spells read: ${all.length} from ${origin}.`);
  printExclusions("spells", reasons, options.verbose, labels);

  if (options.dryRun) return dryRun(spells, options.verbose, classLookup);

  context.usesDatabase();
  const { import5eToolsSpells } = await import("src/services/5etools/5eToolsSpellImportService.js");
  const result = await import5eToolsSpells(spells, {
    mode: options.mode,
    continueOnError: options.continueOnError,
    force: options.force,
    classLookup,
  });

  console.log(`Imported ${result.total} spell(s).`);
  console.log(`Inserted: ${result.inserted}; updated: ${result.updated}; skipped: ${result.skipped}; failed: ${result.failed}.`);
  printList(result.results.flatMap(item => item.warnings.map(warning => `warning: ${item.name}: ${warning}`)), options.verbose, "warning(s)");
  const skippedEdits = result.results.filter(item => item.status === "skipped" && options.mode !== "skip");
  for (const item of skippedEdits) console.log(`skipped: ${item.name}: ${item.reason ?? ""}`);
  for (const failure of result.results.filter(item => item.status === "failed")) {
    console.error(`failed: ${failure.name}: ${failure.error ?? "Unknown error"}`);
  }
  return result.failed === 0;
}

async function loadSpells(options: SpellOptions, context: RunContext): Promise<{ spells: FiveEToolsSpell[]; classLookup?: SpellClassLookup; origin: string }> {
  if (options.file) {
    const filePath = path.resolve(process.cwd(), options.file);
    const spells = parse5eToolsSpells(await readJson(filePath));
    const classLookup = options.classes ? buildSpellClassLookup(await readJson(path.resolve(process.cwd(), options.classes))) : undefined;
    return { spells, classLookup, origin: filePath };
  }
  const mirror = await context.mirror();
  // Spells do not copy each other, so books the selection leaves out are not downloaded.
  const files = await indexedFiles(mirror, "spells", source => context.filter.keepsSource(source));
  const [lookup, ...contents] = await mirror.readAll([CLASS_LOOKUP_FILE, ...files.map(entry => entry.file)]);
  return {
    spells: contents.flatMap(parse5eToolsSpells),
    classLookup: buildSpellClassLookup(lookup),
    origin: `${files.length} spell file(s)`,
  };
}

function dryRun(spells: FiveEToolsSpell[], verbose: boolean, classLookup?: SpellClassLookup): boolean {
  const transformed: Array<ReturnType<typeof transform5eToolsSpell>> = [];
  const failures: string[] = [];
  for (const spell of spells) {
    try {
      transformed.push(transform5eToolsSpell(spell, classLookup));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const warnings = transformed.flatMap(item => item.warnings.map(warning => `warning: ${item.spell.name}: ${warning}`));
  console.log(`Dry run: ${transformed.length} spell(s) would be imported. Warnings: ${warnings.length}; invalid: ${failures.length}.`);
  printList(warnings, verbose, "warning(s)");
  for (const failure of failures) console.log(`invalid: ${failure}`);
  printList(transformed.map(({ spell, tags }) => {
    const classes = tags.filter(tag => tag.tag_type === "class").map(tag => tag.tag).join(", ") || "no classes";
    return `- ${spell.name} [${spell.source}]: level ${spell.level} ${spell.school}, ${spell.casting_time}, ${spell.range_text}, ${spell.duration} (${classes})`;
  }), verbose, "spell(s)");
  return failures.length === 0;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}
