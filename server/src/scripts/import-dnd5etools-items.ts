import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildItemImportPlan,
  type ItemImportIssue,
  type ItemImportPlan,
} from "src/utils/dnd5etools/item-transformer.js";
import type { Dnd5eToolsImportMode } from "src/services/dnd5etools/dnd5eToolsImportService.js";
import type { Dnd5eToolsItemImportResult } from "src/services/dnd5etools/dnd5eToolsItemImportService.js";

interface CliOptions {
  file?: string;
  base?: string;
  variants?: string;
  revision?: string;
  dryRun: boolean;
  mode: Dnd5eToolsImportMode;
  continueOnError: boolean;
  force: boolean;
  verbose: boolean;
  help: boolean;
}

const PREVIEW = 20;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.file || !options.base || !options.variants) {
    printUsage();
    process.exit(1);
  }

  const inputs = await Promise.all([options.file, options.base, options.variants].map(file => readInput(file)));
  const [items, base, variants] = inputs;
  // One revision for the three files: the given upstream commit, else a hash of all three inputs.
  const inputHash = createHash("sha256").update(inputs.map(input => input.sha256).join("\n")).digest("hex");
  const revision = options.revision ?? inputHash;

  console.log(`Source revision: ${options.revision ? `commit ${options.revision}` : `no --revision; input hash ${inputHash}`}`);
  for (const input of inputs) console.log(`  ${input.path}  sha256 ${input.sha256}`);

  const plan = buildItemImportPlan({ items: items.json, base: base.json, variants: variants.json });
  printPlan(plan, options.verbose);

  if (options.dryRun) {
    console.log("Dry run: nothing was written.");
    if (plan.failures.length > 0) process.exitCode = 1;
    return;
  }
  if (plan.failures.length > 0 && !options.continueOnError) {
    console.error(`${plan.failures.length} record(s) cannot be imported; fix them or pass --continue-on-error. Nothing was written.`);
    process.exit(1);
  }

  const { importDnd5eToolsItems } = await import("src/services/dnd5etools/dnd5eToolsItemImportService.js");
  const { closeDnd5eToolsImportPools } = await import("src/services/dnd5etools/dnd5eToolsImportService.js");
  try {
    const result = await importDnd5eToolsItems(plan, {
      mode: options.mode,
      continueOnError: options.continueOnError,
      force: options.force,
      revision,
    });
    printResult(result, options);
    if (result.failed > 0 || plan.failures.length > 0) process.exitCode = 1;
  } finally {
    await closeDnd5eToolsImportPools();
  }
}

async function readInput(file: string): Promise<{ path: string; sha256: string; json: unknown }> {
  const filePath = path.resolve(process.cwd(), file);
  const text = await fs.readFile(filePath, "utf8");
  return { path: filePath, sha256: createHash("sha256").update(text).digest("hex"), json: JSON.parse(text) as unknown };
}

function printPlan(plan: ItemImportPlan, verbose: boolean): void {
  const { input, byKind, byRole } = plan.counts;
  console.log(`Input records: ${input.named} named, ${input.base} base, ${input.group} groups, ${input.family} magic variants.`);
  console.log(`Planned rows: ${plan.records.length} (by upstream kind: ${byKind.named} named, ${byKind.base} base, ${byKind.group} group, ${byKind.family} family, ${byKind.specific} generated specifics).`);
  console.log(`By app role: ${byRole.concrete} concrete, ${byRole.family} family, ${byRole.group} group.`);
  printIssues("invalid", plan.failures, verbose);
  printIssues("unresolved", plan.unresolved, verbose);
  printIssues("cyclic", plan.cyclic, verbose);
  printIssues("unsupported", plan.unsupported, verbose);
}

// Grouped by message pattern, with a few examples each, unless --verbose.
function printIssues(kind: string, issues: ItemImportIssue[], verbose: boolean): void {
  console.log(`${kind}: ${issues.length}`);
  if (verbose) {
    for (const issue of issues) console.log(`  ${issue.label}: ${issue.message}`);
    return;
  }
  const groups = new Map<string, ItemImportIssue[]>();
  for (const issue of issues) {
    const pattern = issue.message.replace(/"[^"]*"/g, '"…"');
    groups.set(pattern, [...(groups.get(pattern) ?? []), issue]);
  }
  for (const [pattern, members] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const examples = members.slice(0, 3).map(issue => issue.message.includes('"') ? `${issue.label} (${issue.message.match(/"[^"]*"/)?.[0] ?? ""})` : issue.label);
    console.log(`  ${members.length} × ${pattern}  e.g. ${examples.join(", ")}`);
  }
}

function printResult(result: Dnd5eToolsItemImportResult, options: CliOptions): void {
  console.log(`Planned: ${result.total}; attempted: ${result.results.length}.`);
  console.log(`Inserted: ${result.inserted}; updated: ${result.updated}; skipped: ${result.skipped}; failed: ${result.failed}.`);

  for (const [heading, field] of [["Upstream kind", "upstreamKind"], ["App role", "kind"]] as const) {
    const breakdown = new Map<string, Record<string, number>>();
    for (const item of result.results) {
      const counts = breakdown.get(item[field]) ?? {};
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      breakdown.set(item[field], counts);
    }
    console.log(`${heading}:`);
    for (const [kind, counts] of breakdown) {
      console.log(`  ${kind}: ${Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(", ")}`);
    }
  }

  const skipped = result.results.filter(item => item.status === "skipped" && !(options.mode === "skip" && item.reason === "already imported"));
  const reasons = new Map<string, number>();
  for (const item of skipped) reasons.set(item.reason ?? "", (reasons.get(item.reason ?? "") ?? 0) + 1);
  for (const [reason, count] of reasons) console.log(`skipped ${count}: ${reason}`);
  for (const item of (options.verbose ? skipped : skipped.slice(0, PREVIEW))) console.log(`  skipped: ${item.name}|${item.source}: ${item.reason ?? ""}`);
  if (!options.verbose && skipped.length > PREVIEW) console.log(`  ... ${skipped.length - PREVIEW} more skipped row(s); --verbose lists them.`);

  const warnings = result.results.flatMap(item => item.warnings.map(warning => `${item.name}|${item.source}: ${warning}`));
  for (const warning of (options.verbose ? warnings : warnings.slice(0, PREVIEW))) console.log(`warning: ${warning}`);
  if (!options.verbose && warnings.length > PREVIEW) console.log(`... ${warnings.length - PREVIEW} more warning(s) omitted.`);

  for (const failure of result.results.filter(item => item.status === "failed")) {
    console.error(`failed: ${failure.name}|${failure.source}: ${failure.error ?? "Unknown error"}`);
  }
  if (result.stoppedAt) console.error(`Stopped at ${result.stoppedAt}; pass --continue-on-error to keep going after a failure.`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { dryRun: false, mode: "upsert", continueOnError: false, force: false, verbose: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--file":
      case "-f":
        options.file = readArgValue(args, ++index, arg);
        break;
      case "--base":
        options.base = readArgValue(args, ++index, arg);
        break;
      case "--variants":
        options.variants = readArgValue(args, ++index, arg);
        break;
      case "--revision":
        options.revision = parseRevision(readArgValue(args, ++index, arg));
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
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parseRevision(value: string): string {
  if (/^[0-9a-f]{7,64}$/i.test(value)) return value.toLowerCase();
  throw new Error(`Invalid --revision "${value}". Expected the upstream commit SHA.`);
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
  npm run import:dnd5etools:items -- --file <items.json> --base <items-base.json> --variants <magicvariants.json> [options]

The three files must come from the same 5etools commit (data/items.json, data/items-base.json,
data/magicvariants.json). Keep them out of git.

Options:
  --revision <sha>       Upstream commit the files came from, recorded on each row. Without it the
                         row records a SHA-256 of the three inputs.
  --dry-run              Resolve copies and templates, generate specifics, validate and report, without touching MySQL.
  --mode <mode>          insert, upsert, or skip. Defaults to upsert.
  --force                Also overwrite items edited in the app. Hidden and deleted items stay so.
  --continue-on-error    Import the valid rows when some fail.
  --verbose              List every issue, skipped row and warning.
  --help                 Show this help.
`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
