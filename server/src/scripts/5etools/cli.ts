import type { FiveEToolsImportMode } from "src/services/5etools/5eToolsEntityImportService.js";
import { FiveEToolsMirror } from "src/services/5etools/5eToolsMirror.js";
import { DEFAULT_EXCLUSIONS, countReasons, createSourceFilter, defaultExclusions, type SourceFilter } from "src/utils/5etools/source-filter.js";

// Shared command-line handling for the 5etools import scripts (import-5etools*.ts).

export interface CommonOptions {
  dryRun: boolean;
  mode: FiveEToolsImportMode;
  continueOnError: boolean;
  force: boolean;
  verbose: boolean;
  help: boolean;
  ref?: string;
  dataDir?: string;
  cacheDir?: string;
  offline: boolean;
  exclude: string[];
  only?: string[];
  /** Default exclusions to keep: group names or sources. */
  include: string[];
  includeReprinted: boolean;
}

export interface RunContext {
  filter: SourceFilter;
  /** The data mirror, opened on first use and shared by every step of a run. */
  mirror(): Promise<FiveEToolsMirror>;
  /** Marks that a step opened database pools, so the run closes them at the end. */
  usesDatabase(): void;
}

export interface ImportCommand<O extends CommonOptions> {
  usage: string;
  /** Parses one command-specific argument at `args[index]`; returns the last index consumed, or undefined. */
  parseArg?(args: string[], index: number, options: O): number | undefined;
  defaults(): Omit<O, keyof CommonOptions>;
  /** Returns false when the step failed (the process exits with 1). */
  run(options: O, context: RunContext): Promise<boolean>;
}

export const PREVIEW = 20;

export const COMMON_USAGE = `
Data (default: download the 5etools data folder at --ref into server/.cache/5etools):
  --ref <branch|sha>       Upstream branch, tag or commit. Defaults to main; the commit is recorded.
  --data-dir <dir>         Read a local 5etools data/ folder instead of downloading.
  --cache-dir <dir>        Mirror location. Defaults to server/.cache/5etools.
  --offline                Use only cached files (a branch resolves to the commit it last resolved to).

Selection (also applies to --file inputs). Left out by default:
${DEFAULT_EXCLUSIONS.map(item => `  ${item.group.padEnd(12)} ${item.sources.join(", ")}`).join("\n")}
  --include-sources <A,B>  Keep default exclusions again, by group name or source (plane-shift, PSZ).
  --include-legacy         Same as --include-sources legacy.
  --exclude-sources <A,B>  Further sources to leave out.
  --sources <A,B>          Keep only these sources.
  --include-reprinted      Keep records whose reprintedAs names a kept source.

Import:
  --dry-run                Read, resolve and report without touching MySQL.
  --mode <mode>            insert, upsert, or skip. Defaults to upsert.
  --continue-on-error      Keep importing after a per-record failure.
  --verbose                List every exclusion, issue and warning.
  --help                   Show this help.`;

export async function runCommand<O extends CommonOptions>(command: ImportCommand<O>): Promise<void> {
  try {
    const options = parseOptions(command, process.argv.slice(2));
    if (options.help) {
      console.log(command.usage);
      return;
    }
    await withContext(options, async context => {
      if (!(await command.run(options, context))) process.exitCode = 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function withContext(options: CommonOptions, body: (context: RunContext) => Promise<void>): Promise<void> {
  let mirror: Promise<FiveEToolsMirror> | undefined;
  let database = false;
  const context: RunContext = {
    filter: createSourceFilter({
      exclude: [...defaultExclusions(options.include), ...options.exclude],
      only: options.only,
      includeReprinted: options.includeReprinted,
    }),
    mirror: () => {
      mirror ??= FiveEToolsMirror.open({
        ref: options.ref,
        dataDir: options.dataDir,
        cacheDir: options.cacheDir,
        offline: options.offline,
        log: message => console.log(message),
      }).then(opened => {
        console.log(`5etools data: ${opened.description}`);
        return opened;
      });
      return mirror;
    },
    usesDatabase: () => {
      database = true;
    },
  };
  console.log(`Selection: ${context.filter.describe()}.`);
  try {
    await body(context);
  } finally {
    if (mirror) {
      const opened = await mirror.catch(() => undefined);
      if (opened?.downloads) console.log(`Downloaded ${opened.downloads} file(s) into the mirror.`);
    }
    if (database) {
      const { close5eToolsImportPools } = await import("src/services/5etools/5eToolsEntityImportService.js");
      await close5eToolsImportPools();
    }
  }
}

export function parseOptions<O extends CommonOptions>(command: ImportCommand<O>, args: string[]): O {
  const options = { ...commonDefaults(), ...command.defaults() } as O;
  for (let index = 0; index < args.length; index += 1) {
    const consumed = parseCommonArg(args, index, options) ?? command.parseArg?.(args, index, options);
    if (consumed === undefined) throw new Error(`Unknown argument: ${args[index]}`);
    index = consumed;
  }
  return options;
}

function commonDefaults(): CommonOptions {
  return {
    dryRun: false, mode: "upsert", continueOnError: false, force: false, verbose: false, help: false,
    offline: false, exclude: [], include: [], includeReprinted: false,
  };
}

function parseCommonArg(args: string[], index: number, options: CommonOptions): number | undefined {
  const arg = args[index];
  switch (arg) {
    case "--dry-run": options.dryRun = true; return index;
    case "--mode": options.mode = parseMode(readArgValue(args, index + 1, arg)); return index + 1;
    case "--continue-on-error": options.continueOnError = true; return index;
    case "--verbose": options.verbose = true; return index;
    case "--help":
    case "-h": options.help = true; return index;
    case "--ref": options.ref = readArgValue(args, index + 1, arg); return index + 1;
    case "--data-dir": options.dataDir = readArgValue(args, index + 1, arg); return index + 1;
    case "--cache-dir": options.cacheDir = readArgValue(args, index + 1, arg); return index + 1;
    case "--offline": options.offline = true; return index;
    case "--exclude-sources": options.exclude.push(...readList(args, index + 1, arg)); return index + 1;
    case "--sources": options.only = [...(options.only ?? []), ...readList(args, index + 1, arg)]; return index + 1;
    case "--include-legacy": options.include.push("legacy"); return index;
    case "--include-sources": options.include.push(...readList(args, index + 1, arg)); return index + 1;
    case "--include-reprinted": options.includeReprinted = true; return index;
    default: return undefined;
  }
}

/** For commands that accept --force. */
export function parseForce(args: string[], index: number, options: CommonOptions): number | undefined {
  if (args[index] !== "--force") return undefined;
  options.force = true;
  return index;
}

function parseMode(value: string): FiveEToolsImportMode {
  if (value === "insert" || value === "upsert" || value === "skip") return value;
  throw new Error(`Invalid --mode "${value}". Expected insert, upsert, or skip.`);
}

export function readArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value.`);
  return value;
}

function readList(args: string[], index: number, flag: string): string[] {
  return readArgValue(args, index, flag).split(",").map(value => value.trim()).filter(Boolean);
}

/** Prints how many records the selection left out and why, grouped by reason. */
export function printExclusions(what: string, reasons: string[], verbose: boolean, labels?: string[]): void {
  console.log(`Excluded ${what}: ${reasons.length}.`);
  const grouped = countReasons(reasons);
  for (const [reason, count] of verbose ? grouped : grouped.slice(0, 12)) console.log(`  ${count} × ${reason}`);
  if (!verbose && grouped.length > 12) console.log(`  ... ${grouped.length - 12} more reason(s); --verbose lists them.`);
  if (verbose && labels) labels.forEach((label, index) => console.log(`  excluded: ${label} (${reasons[index]})`));
}

/** Prints up to PREVIEW lines (all with --verbose) and a count of the rest. */
export function printList(lines: string[], verbose: boolean, what: string): void {
  for (const line of verbose ? lines : lines.slice(0, PREVIEW)) console.log(line);
  if (!verbose && lines.length > PREVIEW) console.log(`... ${lines.length - PREVIEW} more ${what} omitted; --verbose lists them.`);
}

/** Reads `<dir>/index.json` ({ SOURCE: file }) and returns the files of sources the filter keeps. */
export async function indexedFiles(mirror: FiveEToolsMirror, dir: string, keep: (source: string) => boolean): Promise<Array<{ source: string; file: string }>> {
  const index = await mirror.readJson(`${dir}/index.json`);
  if (typeof index !== "object" || index === null || Array.isArray(index)) throw new Error(`${dir}/index.json must map sources to files.`);
  return Object.entries(index)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && keep(entry[0]))
    .map(([source, file]) => ({ source, file: `${dir}/${file}` }));
}
