import fs from "node:fs/promises";
import path from "node:path";
import {
  parseDnd5eToolsMonsters,
  transformDnd5eToolsMonster,
} from "src/utils/dnd5etools/monster-transformer.js";
import type { Dnd5eToolsImportMode } from "src/services/dnd5etools/dnd5eToolsImportService.js";

interface CliOptions {
  file?: string;
  dryRun: boolean;
  mode: Dnd5eToolsImportMode;
  continueOnError: boolean;
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
  const rawJson = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(rawJson) as unknown;
  const monsters = parseDnd5eToolsMonsters(parsed);

  if (options.dryRun) {
    const transformed = monsters.map(transformDnd5eToolsMonster);
    const warningCount = transformed.reduce((count, item) => count + item.warnings.length, 0);

    console.log(`Dry run parsed ${monsters.length} monster(s) from ${filePath}.`);
    console.log(`Warnings: ${warningCount}`);

    for (const item of transformed.slice(0, 10)) {
      console.log(`- ${item.entity.name}${item.source ? ` [${item.source}]` : ""}: ${item.entity.actions?.length ?? 0} action(s), ${item.entity.traits?.length ?? 0} trait(s), ${item.entity.spellcasting?.length ?? 0} spellcasting block(s)`);
      for (const warning of item.warnings.slice(0, 3)) {
        console.log(`  warning: ${warning}`);
      }
    }

    if (transformed.length > 10) console.log(`... ${transformed.length - 10} more monster(s) omitted from preview.`);
    return;
  }

  const {
    closeDnd5eToolsImportPools,
    importDnd5eToolsEntities,
  } = await import("src/services/dnd5etools/dnd5eToolsImportService.js");

  try {
    const result = await importDnd5eToolsEntities(monsters, {
      mode: options.mode,
      continueOnError: options.continueOnError,
    });

    console.log(`Imported ${result.total} monster(s).`);
    console.log(`Inserted: ${result.inserted}; updated: ${result.updated}; skipped: ${result.skipped}; failed: ${result.failed}.`);

    const warnings = result.results.flatMap(item => item.warnings.map(warning => `${item.name}: ${warning}`));
    for (const warning of warnings.slice(0, 20)) {
      console.log(`warning: ${warning}`);
    }
    if (warnings.length > 20) console.log(`... ${warnings.length - 20} more warning(s) omitted.`);

    const failures = result.results.filter(item => item.status === "failed");
    for (const failure of failures) {
      console.error(`failed: ${failure.name}: ${failure.error ?? "Unknown error"}`);
    }

    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await closeDnd5eToolsImportPools();
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    mode: "upsert",
    continueOnError: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--file":
      case "-f":
        options.file = readArgValue(args, ++index, arg);
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
  npm run import:dnd5etools -- --file <bestiary.json> [options]

Options:
  --dry-run              Parse and preview without touching MySQL.
  --mode <mode>          insert, upsert, or skip. Defaults to upsert.
  --continue-on-error    Keep importing after a per-monster failure.
  --help                 Show this help.
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
