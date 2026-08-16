import { isRecord } from "./primitives.js";

// Which upstream records an import keeps. Pure, shared by the monster, spell and item importers.
//
// Rules, in order:
// 1. A source in `exclude` is left out. By default that is every source in DEFAULT_EXCLUSIONS.
// 2. With `only`, a source outside it is left out.
// 3. A record whose `reprintedAs` names a reprint from a kept source is left out (for example
//    Mind Flayer Arcanist|VGM, reprinted in MPMM), so the catalog holds one version of each.

export interface ExclusionGroup {
  /** Name for --include-sources. */
  group: string;
  label: string;
  sources: readonly string[];
}

/** Sources every import leaves out unless re-included, by group. */
export const DEFAULT_EXCLUSIONS: readonly ExclusionGroup[] = [
  // Replaced by the 2024/2025 core books (XPHB, XDMG, XMM).
  { group: "legacy", label: "2014 core book", sources: ["PHB", "MM", "DMG"] },
  // Free web supplements (2016-2018), never reprinted in print.
  { group: "plane-shift", label: "Plane Shift", sources: ["PSZ", "PSI", "PSK", "PSA", "PSX", "PSD"] },
  // Licensed crossovers written as jokes or toys.
  { group: "novelty", label: "novelty crossover", sources: ["RMR", "RMBRE", "LRDT", "WttHC"] },
  // Children's books and adventures.
  {
    group: "kids",
    label: "children's book",
    sources: ["AWM", "MGELFT", "NRH-TCMC", "NRH-AVitW", "NRH-ASS", "NRH-CoI", "NRH-TLT", "NRH-AWoL", "NRH-AT"],
  },
];

/** The 2014 core rulebooks. */
export const LEGACY_SOURCES = DEFAULT_EXCLUSIONS[0].sources;

/**
 * DEFAULT_EXCLUSIONS without `include`: group names ("plane-shift") or sources ("PSZ").
 * Throws on a name that is neither.
 */
export function defaultExclusions(include: Iterable<string> = []): string[] {
  const kept = new Set<string>();
  for (const name of include) {
    const key = name.toLowerCase();
    const group = DEFAULT_EXCLUSIONS.find(item => item.group === key);
    const sources = group?.sources ?? DEFAULT_EXCLUSIONS.flatMap(item => item.sources).filter(source => source.toLowerCase() === key);
    if (!sources.length) {
      throw new Error(`"${name}" is not an excluded group or source. Groups: ${DEFAULT_EXCLUSIONS.map(item => item.group).join(", ")}.`);
    }
    for (const source of sources) kept.add(source.toLowerCase());
  }
  return DEFAULT_EXCLUSIONS.flatMap(item => item.sources).filter(source => !kept.has(source.toLowerCase()));
}

const EXCLUSION_LABELS = new Map(DEFAULT_EXCLUSIONS.flatMap(item => item.sources.map(source => [source.toLowerCase(), item.label])));

export interface SourceSelectionOptions {
  /** Upstream sources to leave out (case-insensitive). Defaults to every DEFAULT_EXCLUSIONS source. */
  exclude?: Iterable<string>;
  /** Keep only these sources. */
  only?: Iterable<string>;
  /** Keep records that were reprinted in a kept source. */
  includeReprinted?: boolean;
}

export interface SourceFilter {
  /** Whether records from `source` can be kept. */
  keepsSource(source: string | undefined): boolean;
  /** Why the record is left out, or undefined when it is kept. */
  reject(record: Record<string, unknown>): string | undefined;
  /** The first reprint (lower-case name|source) from a kept source, whether or not reprints are kept. */
  keptReprint(record: Record<string, unknown>): string | undefined;
  describe(): string;
}

export function createSourceFilter(options: SourceSelectionOptions = {}): SourceFilter {
  const exclude = new Set([...(options.exclude ?? defaultExclusions())].map(source => source.toLowerCase()));
  const only = options.only ? new Set([...options.only].map(source => source.toLowerCase())) : undefined;

  const sourceReason = (source: string | undefined): string | undefined => {
    const key = (source ?? "").toLowerCase();
    if (exclude.has(key)) return `excluded source ${source}${EXCLUSION_LABELS.has(key) ? ` (${EXCLUSION_LABELS.get(key)})` : ""}`;
    if (only && !only.has(key)) return `source ${source || "(none)"} not selected`;
    return undefined;
  };

  const keptReprint = (record: Record<string, unknown>): string | undefined => {
    for (const reprint of reprintsOf(record)) {
      if (!sourceReason(reprint.split("|")[1])) return reprint.toLowerCase();
    }
    return undefined;
  };

  return {
    keepsSource: source => !sourceReason(source),
    reject(record) {
      const bySource = sourceReason(sourceOf(record));
      if (bySource) return bySource;
      if (options.includeReprinted) return undefined;
      const reprint = keptReprint(record);
      return reprint ? `reprinted as ${reprint}` : undefined;
    },
    keptReprint,
    describe() {
      const parts = [exclude.size ? `excluding ${exclude.size} source(s)` : "no excluded sources"];
      if (only) parts.push(`only ${[...only].join(", ").toUpperCase()}`);
      parts.push(options.includeReprinted ? "keeping reprinted records" : "skipping records reprinted in a kept source");
      return parts.join("; ");
    },
  };
}

/** `reprintedAs` entries as "Name|SOURCE": upstream writes a uid string or `{ uid, tag }`. */
function reprintsOf(record: Record<string, unknown>): string[] {
  const value = record.reprintedAs;
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const uid = typeof entry === "string" ? entry : isRecord(entry) && typeof entry.uid === "string" ? entry.uid : undefined;
    return uid && uid.includes("|") ? [uid] : [];
  });
}

const sourceOf = (record: Record<string, unknown>): string | undefined =>
  typeof record.source === "string" ? record.source
    : isRecord(record.inherits) && typeof record.inherits.source === "string" ? record.inherits.source
      : undefined;

/** Counts rejections by reason, for reports. */
export function countReasons(reasons: Iterable<string>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    // "reprinted as goblin|xmm" -> "reprinted in XMM", so the report groups by book.
    const key = reason.startsWith("reprinted as ") ? `reprinted in ${reason.split("|")[1]?.toUpperCase() ?? "?"}` : reason;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
