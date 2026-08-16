import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildItemImportPlan,
  type ItemImportIssue,
  type ItemImportPlan,
} from "src/utils/5etools/item-transformer.js";
import type { FiveEToolsItemImportResult } from "src/services/5etools/5eToolsItemImportService.js";
import {
  COMMON_USAGE,
  PREVIEW,
  parseForce,
  printExclusions,
  printList,
  readArgValue,
  type CommonOptions,
  type ImportCommand,
  type RunContext,
} from "./cli.js";

export interface ItemOptions extends CommonOptions {
  file?: string;
  base?: string;
  variants?: string;
  revision?: string;
}

const MIRROR_FILES = ["items.json", "items-base.json", "magicvariants.json"] as const;

export const itemCommand: ImportCommand<ItemOptions> = {
  usage: `
Usage:
  npm run import:5etools:items -- [options]
  npm run import:5etools:items -- --file <items.json> --base <items-base.json> --variants <magicvariants.json> [options]

Without --file, reads data/${MIRROR_FILES.join(", data/")} from one commit and records it.
With --file, the three files must come from the same 5etools commit. Keep them out of git.

Items:
  --file, --base, --variants <file>
                           Local copies of the three files (all three, or none).
  --revision <sha>         Upstream commit of the --file inputs, recorded on each row. Without it the
                           row records a SHA-256 of the three inputs.
  --force                  Also overwrite items edited in the app. Hidden and deleted items stay so.
${COMMON_USAGE}
`,
  defaults: () => ({}),
  parseArg(args, index, options) {
    switch (args[index]) {
      case "--file":
      case "-f": options.file = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--base": options.base = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--variants": options.variants = readArgValue(args, index + 1, args[index]); return index + 1;
      case "--revision": options.revision = parseRevision(readArgValue(args, index + 1, args[index])); return index + 1;
      default: return parseForce(args, index, options);
    }
  },
  run: runItemImport,
};

interface Input {
  path: string;
  sha256: string;
  json: unknown;
}

async function runItemImport(options: ItemOptions, context: RunContext): Promise<boolean> {
  const { inputs, commit } = await loadInputs(options, context);
  const [items, base, variants] = inputs;
  // One revision for the three files: the upstream commit, else a hash of all three inputs.
  const inputHash = createHash("sha256").update(inputs.map(input => input.sha256).join("\n")).digest("hex");
  const revision = commit ?? inputHash;

  console.log(`Source revision: ${commit ? `commit ${commit}` : `no --revision; input hash ${inputHash}`}`);
  for (const input of inputs) console.log(`  ${input.path}  sha256 ${input.sha256}`);

  const plan = buildItemImportPlan({ items: items.json, base: base.json, variants: variants.json }, { filter: context.filter });
  printPlan(plan, options.verbose);

  if (options.dryRun) {
    console.log("Dry run: nothing was written.");
    return plan.failures.length === 0;
  }
  if (plan.failures.length > 0 && !options.continueOnError) {
    console.error(`${plan.failures.length} record(s) cannot be imported; fix them or pass --continue-on-error. Nothing was written.`);
    return false;
  }

  context.usesDatabase();
  const { import5eToolsItems } = await import("src/services/5etools/5eToolsItemImportService.js");
  const result = await import5eToolsItems(plan, {
    mode: options.mode,
    continueOnError: options.continueOnError,
    force: options.force,
    revision,
  });
  printResult(result, options);
  return result.failed === 0 && plan.failures.length === 0;
}

async function loadInputs(options: ItemOptions, context: RunContext): Promise<{ inputs: [Input, Input, Input]; commit?: string }> {
  const files = [options.file, options.base, options.variants];
  if (files.some(Boolean)) {
    if (!files.every(Boolean)) throw new Error("--file, --base and --variants go together.");
    const inputs = await Promise.all(files.map(async file => {
      const filePath = path.resolve(process.cwd(), file as string);
      return toInput(filePath, await fs.readFile(filePath, "utf8"));
    }));
    return { inputs: inputs as [Input, Input, Input], commit: options.revision };
  }
  if (options.revision) throw new Error("--revision is for --file inputs; use --ref to pick the upstream commit.");
  const mirror = await context.mirror();
  const inputs = await Promise.all(MIRROR_FILES.map(async file => {
    await mirror.readJson(file); // fetches into the mirror when missing
    const filePath = mirror.pathOf(file);
    return toInput(filePath, await fs.readFile(filePath, "utf8"));
  }));
  return { inputs: inputs as [Input, Input, Input], commit: mirror.revision };
}

function toInput(filePath: string, text: string): Input {
  return { path: filePath, sha256: createHash("sha256").update(text).digest("hex"), json: JSON.parse(text) as unknown };
}

function printPlan(plan: ItemImportPlan, verbose: boolean): void {
  const { input, byKind, byRole } = plan.counts;
  console.log(`Input records: ${input.named} named, ${input.base} base, ${input.group} groups, ${input.family} magic variants.`);
  printExclusions("records", plan.excluded.map(issue => issue.message), verbose, plan.excluded.map(issue => issue.label));
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
    const pattern = issue.message.replace(/"[^"]*"/g, '"…"').replace(/\([^)]*\)/g, "(…)");
    groups.set(pattern, [...(groups.get(pattern) ?? []), issue]);
  }
  for (const [pattern, members] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const examples = members.slice(0, 3).map(issue => issue.message.includes('"') ? `${issue.label} (${issue.message.match(/"[^"]*"/)?.[0] ?? ""})` : issue.label);
    console.log(`  ${members.length} × ${pattern}  e.g. ${examples.join(", ")}`);
  }
}

function printResult(result: FiveEToolsItemImportResult, options: ItemOptions): void {
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

  printList(result.results.flatMap(item => item.warnings.map(warning => `warning: ${item.name}|${item.source}: ${warning}`)), options.verbose, "warning(s)");
  for (const failure of result.results.filter(item => item.status === "failed")) {
    console.error(`failed: ${failure.name}|${failure.source}: ${failure.error ?? "Unknown error"}`);
  }
  if (result.stoppedAt) console.error(`Stopped at ${result.stoppedAt}; pass --continue-on-error to keep going after a failure.`);
}

function parseRevision(value: string): string {
  if (/^[0-9a-f]{7,64}$/i.test(value)) return value.toLowerCase();
  throw new Error(`Invalid --revision "${value}". Expected the upstream commit SHA.`);
}
