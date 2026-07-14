import fs from "node:fs/promises";
import path from "node:path";
import {
  buildSpellClassLookup,
  parseDnd5eToolsSpells,
  transformDnd5eToolsSpell,
  type SpellClassLookup,
} from "src/utils/dnd5etools/spell-transformer.js";
import type { Dnd5eToolsImportMode } from "src/services/dnd5etools/dnd5eToolsImportService.js";

interface CliOptions {
  file?: string;
  classes?: string;
  dryRun: boolean;
  mode: Dnd5eToolsImportMode;
  continueOnError: boolean;
  force: boolean;
  help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }
  if (!options.file) {
    printUsage();
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), options.file);
  const spells = parseDnd5eToolsSpells(await readJson(filePath));
  const classLookup = options.classes
    ? buildSpellClassLookup(await readJson(path.resolve(process.cwd(), options.classes)))
    : undefined;
  if (!classLookup) console.log("No --classes file: spells are imported without class lists.");

  if (options.dryRun) {
    dryRun(spells, filePath, classLookup);
    return;
  }

  const { importDnd5eToolsSpells } = await import("src/services/dnd5etools/dnd5eToolsSpellImportService.js");
  const { closeDnd5eToolsImportPools } = await import("src/services/dnd5etools/dnd5eToolsImportService.js");

  try {
    const result = await importDnd5eToolsSpells(spells, {
      mode: options.mode,
      continueOnError: options.continueOnError,
      force: options.force,
      classLookup,
    });

    console.log(`Imported ${result.total} spell(s).`);
    console.log(`Inserted: ${result.inserted}; updated: ${result.updated}; skipped: ${result.skipped}; failed: ${result.failed}.`);

    const warnings = result.results.flatMap(item => item.warnings.map(warning => `${item.name}: ${warning}`));
    for (const warning of warnings.slice(0, 20)) console.log(`warning: ${warning}`);
    if (warnings.length > 20) console.log(`... ${warnings.length - 20} more warning(s) omitted.`);

    const skippedEdits = result.results.filter(item => item.status === "skipped" && options.mode !== "skip");
    for (const item of skippedEdits) console.log(`skipped: ${item.name}: ${item.reason ?? ""}`);

    for (const failure of result.results.filter(item => item.status === "failed")) {
      console.error(`failed: ${failure.name}: ${failure.error ?? "Unknown error"}`);
    }
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await closeDnd5eToolsImportPools();
  }
}

function dryRun(spells: ReturnType<typeof parseDnd5eToolsSpells>, filePath: string, classLookup?: SpellClassLookup): void {
  const transformed: Array<ReturnType<typeof transformDnd5eToolsSpell>> = [];
  const failures: string[] = [];
  for (const spell of spells) {
    try {
      transformed.push(transformDnd5eToolsSpell(spell, classLookup));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const warnings = transformed.flatMap(item => item.warnings.map(warning => `${item.spell.name}: ${warning}`));
  console.log(`Dry run parsed ${transformed.length} spell(s) from ${filePath}.`);
  console.log(`Warnings: ${warnings.length}; invalid: ${failures.length}.`);
  for (const warning of warnings.slice(0, 20)) console.log(`warning: ${warning}`);
  for (const failure of failures) console.log(`invalid: ${failure}`);

  for (const { spell, tags } of transformed.slice(0, 10)) {
    const classes = tags.filter(tag => tag.tag_type === "class").map(tag => tag.tag).join(", ") || "no classes";
    console.log(`- ${spell.name} [${spell.source}]: level ${spell.level} ${spell.school}, ${spell.casting_time}, ${spell.range_text}, ${spell.duration} (${classes})`);
  }
  if (transformed.length > 10) console.log(`... ${transformed.length - 10} more spell(s) omitted from preview.`);
  if (failures.length > 0) process.exitCode = 1;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    mode: "upsert",
    continueOnError: false,
    force: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--file":
      case "-f":
        options.file = readArgValue(args, ++index, arg);
        break;
      case "--classes":
        options.classes = readArgValue(args, ++index, arg);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--mode":
        options.mode = parseMode(readArgValue(args, ++index, arg));
        break;
      case "--continue-on-error":
        options.continueOnError = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (!options.file && !arg.startsWith("-")) {
          options.file = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseMode(value: string): Dnd5eToolsImportMode {
  if (value === "insert" || value === "upsert" || value === "skip") return value;
  throw new Error(`Invalid --mode "${value}". Expected insert, upsert, or skip.`);
}

function readArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value.`);
  return value;
}

function printUsage(): void {
  console.log(`
Usage:
  npm run import:dnd5etools:spells -- --file <spells-xphb.json> [options]

Options:
  --classes <file>       5etools generated/gendata-spell-source-lookup.json, for class lists.
  --dry-run              Parse and preview without touching MySQL.
  --mode <mode>          insert, upsert, or skip. Defaults to upsert.
  --force                Also overwrite spells edited in the app.
  --continue-on-error    Keep importing after a per-spell failure.
  --help                 Show this help.
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
