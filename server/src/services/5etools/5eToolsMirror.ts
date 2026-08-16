import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local mirror of the 5etools data folder (github.com/5etools-mirror-3/5etools-src, data/).
//
// A branch or tag is resolved to its commit SHA once per run; files are fetched from that commit and
// kept under <cacheDir>/<sha>/data/, so a repeat import reads from disk and every file in one run
// comes from the same commit. `dataDir` reads an existing checkout's data/ folder instead and never
// touches the network.

export const DEFAULT_5ETOOLS_REPO = "5etools-mirror-3/5etools-src";
/** server/.cache/5etools (git-ignored). */
export const DEFAULT_5ETOOLS_CACHE_DIR = fileURLToPath(new URL("../../../.cache/5etools/", import.meta.url));

const USER_AGENT = "5etools-data-import";
const CONCURRENCY = 8;
const ATTEMPTS = 3;
const SHA = /^[0-9a-f]{40}$/i;

export interface FiveEToolsMirrorOptions {
  /** Branch, tag or commit SHA. Defaults to main. */
  ref?: string;
  /** A local data/ folder (for example a 5etools-src checkout); disables downloads. */
  dataDir?: string;
  cacheDir?: string;
  /** Use only what is cached; a branch resolves to the commit it last resolved to. */
  offline?: boolean;
  repo?: string;
  log?: (message: string) => void;
}

export class FiveEToolsMirror {
  private downloaded = 0;

  private constructor(
    /** Commit SHA the files come from; undefined for a local data folder. */
    readonly revision: string | undefined,
    /** Folder holding the data files. */
    readonly root: string,
    private readonly options: FiveEToolsMirrorOptions,
  ) {}

  static async open(options: FiveEToolsMirrorOptions = {}): Promise<FiveEToolsMirror> {
    if (options.dataDir) {
      const root = path.resolve(options.dataDir);
      await fs.access(root).catch(() => {
        throw new Error(`--data-dir ${root} does not exist.`);
      });
      return new FiveEToolsMirror(undefined, root, options);
    }
    const cacheDir = path.resolve(options.cacheDir ?? DEFAULT_5ETOOLS_CACHE_DIR);
    const revision = await resolveRef(options.ref ?? "main", cacheDir, options);
    return new FiveEToolsMirror(revision, path.join(cacheDir, revision, "data"), options);
  }

  get description(): string {
    return this.revision
      ? `${this.options.repo ?? DEFAULT_5ETOOLS_REPO} commit ${this.revision} (${this.root})`
      : `local data folder ${this.root}`;
  }

  /** Files fetched in this run (the rest came from the cache). */
  get downloads(): number {
    return this.downloaded;
  }

  /** Reads data/<file>, fetching it first when it is not cached. */
  async readJson(file: string): Promise<unknown> {
    const filePath = this.pathOf(file);
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (!this.revision || this.options.offline || !isMissing(error)) {
        throw new Error(`${file} is not available at ${filePath}${this.options.offline ? " (offline)" : ""}.`, { cause: error });
      }
      text = await this.download(file, filePath);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`${filePath} is not valid JSON.`, { cause: error });
    }
  }

  /** Reads several files, fetching up to CONCURRENCY at a time; results keep the order of `files`. */
  async readAll(files: string[]): Promise<unknown[]> {
    const results: unknown[] = new Array(files.length);
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        results[index] = await this.readJson(files[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    return results;
  }

  pathOf(file: string): string {
    const filePath = path.resolve(this.root, file);
    if (!filePath.startsWith(this.root + path.sep)) throw new Error(`Refusing to read ${file} outside the data folder.`);
    return filePath;
  }

  private async download(file: string, filePath: string): Promise<string> {
    const url = `https://raw.githubusercontent.com/${this.options.repo ?? DEFAULT_5ETOOLS_REPO}/${this.revision}/data/${file}`;
    const text = await fetchText(url, {});
    JSON.parse(text); // never cache a truncated or HTML error body
    await writeAtomic(filePath, text);
    this.downloaded += 1;
    return text;
  }
}

async function resolveRef(ref: string, cacheDir: string, options: FiveEToolsMirrorOptions): Promise<string> {
  if (SHA.test(ref)) return ref.toLowerCase();
  const pointer = path.join(cacheDir, "refs", encodeURIComponent(ref));
  if (options.offline) {
    const cached = (await fs.readFile(pointer, "utf8").catch(() => "")).trim();
    if (!SHA.test(cached)) throw new Error(`No cached commit for "${ref}"; run once without --offline or pass a commit SHA.`);
    options.log?.(`Offline: "${ref}" is commit ${cached}, as last resolved.`);
    return cached;
  }
  const headers: Record<string, string> = { Accept: "application/vnd.github.sha" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const sha = (await fetchText(`https://api.github.com/repos/${options.repo ?? DEFAULT_5ETOOLS_REPO}/commits/${encodeURIComponent(ref)}`, headers)).trim();
  if (!SHA.test(sha)) throw new Error(`GitHub did not return a commit SHA for "${ref}".`);
  await writeAtomic(pointer, `${sha}\n`);
  return sha.toLowerCase();
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...headers } });
      if (response.ok) return await response.text();
      const error = new Error(`GET ${url}: HTTP ${response.status}`);
      // 404 and auth errors do not get better on retry.
      if (response.status < 500 && response.status !== 429) throw Object.assign(error, { final: true });
      lastError = error;
    } catch (error) {
      if (error instanceof Error && "final" in error) throw error;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
  }
  throw new Error(`GET ${url} failed after ${ATTEMPTS} attempts.`, { cause: lastError });
}

async function writeAtomic(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temp, text);
  await fs.rename(temp, filePath);
}

const isMissing = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";
