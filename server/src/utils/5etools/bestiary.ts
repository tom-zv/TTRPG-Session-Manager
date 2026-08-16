import { CopyError, TEMPLATE_COPY_PROFILE, monsterCopyProfile, resolveCopies, type UpstreamRecord } from "./copy.js";
import { isRecord } from "./primitives.js";
import type { SourceFilter } from "./source-filter.js";
import type { FiveEToolsMonster } from "./types.js";

// Bestiary preparation: resolve `_copy` (and its `_templates`) across every loaded file, then pick
// the monsters to import. Copies must resolve before filtering: most adventure monsters copy a
// Monster Manual (2014) creature, which is itself left out of the import.

export interface BestiaryIssue {
  label: string;
  message: string;
  kind: CopyError["kind"];
}

export interface PreparedBestiary {
  /** Resolved monsters to import, in input order. */
  monsters: FiveEToolsMonster[];
  /** Monsters the filter left out, with the reason. */
  excluded: Array<{ label: string; reason: string }>;
  /** Kept monsters whose copy or template could not be resolved; left out. */
  failures: BestiaryIssue[];
  /** Templates (bestiary/template.json) that could not be resolved. */
  templateFailures: BestiaryIssue[];
  /** Kept monsters built from a `_copy`. */
  copies: number;
}

const keyOf = (record: UpstreamRecord) => `${String(record.name)}|${String(record.source)}`.toLowerCase();
const labelOf = (record: UpstreamRecord) => `${String(record.name ?? "(unnamed)")}|${String(record.source ?? "?")}`;

/**
 * `monsters` is every bestiary record available as a copy parent, kept or not; `templateJson` is
 * bestiary/template.json (omit it when copies with templates should fail).
 */
export function prepareBestiary(monsters: FiveEToolsMonster[], filter: SourceFilter, templateJson?: unknown): PreparedBestiary {
  const { templates, failures: templateFailures } = buildTemplates(templateJson);
  const resolution = resolveCopies(monsters, keyOf, monsterCopyProfile(templates));
  const failed = new Map(resolution.failures.map(failure => [failure.index, failure]));

  const prepared: PreparedBestiary = { monsters: [], excluded: [], failures: [], templateFailures, copies: 0 };
  monsters.forEach((raw, index) => {
    const record = resolution.records[index] ?? raw;
    // reprintedAs is not inherited by a copy, so the record as written decides.
    const reason = filter.reject({ ...raw, source: record.source });
    if (reason) {
      prepared.excluded.push({ label: labelOf(raw), reason });
      return;
    }
    const failure = failed.get(index);
    if (failure) {
      prepared.failures.push({ label: labelOf(raw), message: failure.error, kind: failure.kind });
      return;
    }
    if (isRecord(raw._copy)) prepared.copies += 1;
    prepared.monsters.push(record as FiveEToolsMonster);
  });
  return prepared;
}

function buildTemplates(templateJson: unknown): { templates: Map<string, UpstreamRecord>; failures: BestiaryIssue[] } {
  const templates = new Map<string, UpstreamRecord>();
  const failures: BestiaryIssue[] = [];
  const list = isRecord(templateJson) && Array.isArray(templateJson.monsterTemplate)
    ? templateJson.monsterTemplate.filter(isRecord)
    : [];
  // Templates copy each other (upstream _meta.internalCopies: ["monsterTemplate"]).
  const resolution = resolveCopies(list, keyOf, TEMPLATE_COPY_PROFILE);
  for (const failure of resolution.failures) failures.push({ label: labelOf(list[failure.index]), message: failure.error, kind: failure.kind });
  resolution.records.forEach(record => {
    if (record && !templates.has(keyOf(record))) templates.set(keyOf(record), record);
  });
  return { templates, failures };
}
