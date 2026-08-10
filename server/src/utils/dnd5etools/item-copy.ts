import { isRecord } from "./primitives.js";

// 5etools `_copy` inheritance within one record list (the `_meta.internalCopies` of items.json and
// magicvariants.json). A record names a parent by name and source, takes the parent's fields it does
// not set itself, then applies `_mod` operations in order. Mirrors the upstream copy applier
// (js/utils.js DataUtil.generic.copyApplier) for the operations the item data uses.

export type UpstreamRecord = Record<string, unknown>;

export interface CopyResolution {
  /** The resolved records in input order; `undefined` where resolution failed. */
  records: Array<UpstreamRecord | undefined>;
  failures: Array<{ index: number; error: string; kind: "unresolved" | "cyclic" | "unsupported" }>;
}

export class CopyError extends Error {
  constructor(message: string, readonly kind: "unresolved" | "cyclic" | "unsupported") {
    super(message);
  }
}

// Fields a copy takes from its parent only when `_preserve` names them (upstream
// _MERGE_REQUIRES_PRESERVE_BASE plus the item page's own list).
const PRESERVED_ONLY_ON_REQUEST = new Set([
  "page", "otherSources", "referenceSources", "srd", "srd52", "basicRules", "basicRules2024", "reprintedAs",
  "hasFluff", "hasFluffImages", "hasToken", "tokenCredit", "tokenCustom", "foundryTokenScale", "altArt", "_versions",
  "lootTables", "tier",
]);

/**
 * Resolves every `_copy` in `records`. `keyOf` gives the lookup key of a record or a `_copy`
 * reference (lower-case name|source); the first record with a key wins, as upstream.
 */
export function resolveCopies(records: UpstreamRecord[], keyOf: (record: UpstreamRecord) => string): CopyResolution {
  const byKey = new Map<string, number>();
  records.forEach((record, index) => {
    const key = keyOf(record);
    if (!byKey.has(key)) byKey.set(key, index);
  });

  const resolved = new Map<number, UpstreamRecord>();
  const failed = new Map<number, CopyError>();

  const resolve = (index: number, chain: number[]): UpstreamRecord => {
    const done = resolved.get(index);
    if (done) return done;
    const failure = failed.get(index);
    if (failure) throw failure;

    const record = records[index];
    const copy = record._copy;
    if (!isRecord(copy)) {
      const plain = structuredClone(record);
      resolved.set(index, plain);
      return plain;
    }

    const label = describe(record);
    try {
      const parentIndex = byKey.get(keyOf(copy));
      if (parentIndex === undefined) throw new CopyError(`${label}: _copy target ${describe(copy)} not found.`, "unresolved");
      if (parentIndex === index || chain.includes(parentIndex)) {
        const cycle = [...chain, index, parentIndex].map(item => describe(records[item])).join(" -> ");
        throw new CopyError(`Cyclic _copy: ${cycle}.`, "cyclic");
      }
      const parent = resolve(parentIndex, [...chain, index]);
      const result = applyCopy(structuredClone(parent), record, label);
      resolved.set(index, result);
      return result;
    } catch (error) {
      const copyError = error instanceof CopyError ? error : new CopyError(`${label}: ${String(error)}`, "unsupported");
      failed.set(index, copyError);
      throw copyError;
    }
  };

  const output: CopyResolution = { records: [], failures: [] };
  records.forEach((_record, index) => {
    try {
      output.records.push(resolve(index, []));
    } catch (error) {
      const copyError = error as CopyError;
      output.records.push(undefined);
      output.failures.push({ index, error: copyError.message, kind: copyError.kind });
    }
  });
  return output;
}

function applyCopy(parent: UpstreamRecord, record: UpstreamRecord, label: string): UpstreamRecord {
  const copyMeta = record._copy as UpstreamRecord;
  const preserve = isRecord(copyMeta._preserve) ? copyMeta._preserve : {};
  const result: UpstreamRecord = structuredClone(record);
  delete result._copy;

  for (const key of Object.keys(parent)) {
    if (result[key] === null) {
      delete result[key];
      continue;
    }
    if (Object.hasOwn(result, key) && result[key] !== undefined) continue;
    if (PRESERVED_ONLY_ON_REQUEST.has(key) && !preserve["*"] && !preserve[key]) continue;
    Object.defineProperty(result, key, { value: parent[key], enumerable: true, configurable: true, writable: true });
  }

  if (copyMeta._templates !== undefined) throw new CopyError(`${label}: _copy templates are not supported.`, "unsupported");
  if (!isRecord(copyMeta._mod)) return result;
  if (JSON.stringify(copyMeta._mod).includes("<$")) {
    throw new CopyError(`${label}: _copy variables (<$...$>) are not supported.`, "unsupported");
  }

  // Upstream applies "_" and "*" after named properties; "*" targets creature fields only.
  const entries = Object.entries(copyMeta._mod).sort(([a], [b]) => tailRank(a) - tailRank(b));
  for (const [prop, modValue] of entries) {
    if (prop === "*") throw new CopyError(`${label}: _mod "*" is not supported for items.`, "unsupported");
    const path = prop === "_" ? null : prop.split(".");
    if (path) assertSafePath(path);
    for (const modInfo of Array.isArray(modValue) ? modValue : [modValue]) {
      applyMod(result, path, modInfo, `${label}: _mod ${prop}`);
    }
  }
  return result;
}

const tailRank = (prop: string) => ["_", "*"].indexOf(prop);

function applyMod(target: UpstreamRecord, path: string[] | null, modInfo: unknown, label: string): void {
  if (modInfo === "remove") {
    if (path) deletePath(target, path);
    return;
  }
  if (!isRecord(modInfo) || typeof modInfo.mode !== "string") {
    throw new CopyError(`${label}: unsupported operation ${JSON.stringify(modInfo)}.`, "unsupported");
  }
  const items = () => Array.isArray(modInfo.items) ? modInfo.items : [modInfo.items];
  const existingArray = (required: boolean): unknown[] | undefined => {
    const value = path ? getPath(target, path) : undefined;
    if (Array.isArray(value)) return value;
    if (required) throw new CopyError(`${label}: no array at "${path?.join(".") ?? ""}".`, "unresolved");
    return undefined;
  };
  const requirePath = () => {
    if (!path) throw new CopyError(`${label}: ${String(modInfo.mode)} needs a property.`, "unsupported");
    return path;
  };

  switch (modInfo.mode) {
    case "appendStr": {
      const current = getPath(target, requirePath());
      const joiner = typeof modInfo.joiner === "string" ? modInfo.joiner : "";
      setPath(target, requirePath(), current ? `${String(current)}${joiner}${String(modInfo.str)}` : modInfo.str);
      return;
    }
    case "prependArr": {
      const current = existingArray(false);
      setPath(target, requirePath(), current ? [...items(), ...current] : items());
      return;
    }
    case "appendArr": {
      const current = existingArray(false);
      setPath(target, requirePath(), current ? [...current, ...items()] : items());
      return;
    }
    case "appendIfNotExistsArr": {
      const current = existingArray(false);
      if (!current) {
        setPath(target, requirePath(), items());
        return;
      }
      setPath(target, requirePath(), [...current, ...items().filter(item => !current.some(existing => deepEqual(existing, item)))]);
      return;
    }
    case "insertArr": {
      const current = existingArray(true) as unknown[];
      const index = typeof modInfo.index === "number" ? modInfo.index : -1;
      current.splice(index === -1 ? current.length : index, 0, ...items());
      return;
    }
    case "replaceArr":
    case "replaceOrAppendArr": {
      const required = modInfo.mode === "replaceArr";
      const current = existingArray(required);
      const index = current ? findReplaceIndex(current, modInfo.replace) : -1;
      if (current && index !== -1) {
        current.splice(index, 1, ...items());
        return;
      }
      if (required) throw new CopyError(`${label}: nothing named ${JSON.stringify(modInfo.replace)} to replace.`, "unresolved");
      setPath(target, requirePath(), [...(current ?? []), ...items()]);
      return;
    }
    case "removeArr": {
      const current = existingArray(true) as unknown[];
      if (modInfo.names !== undefined) {
        for (const name of Array.isArray(modInfo.names) ? modInfo.names : [modInfo.names]) {
          const index = current.findIndex(item => isRecord(item) && item.name === name);
          if (index !== -1) current.splice(index, 1);
          else if (!modInfo.force) throw new CopyError(`${label}: nothing named "${String(name)}" to remove.`, "unresolved");
        }
        return;
      }
      for (const item of items()) {
        const index = current.findIndex(existing => existing === item);
        if (index === -1) throw new CopyError(`${label}: no ${JSON.stringify(item)} to remove.`, "unresolved");
        current.splice(index, 1);
      }
      return;
    }
    case "replaceTxt": {
      const current = existingArray(false);
      if (!current || typeof modInfo.replace !== "string") return;
      const pattern = new RegExp(modInfo.replace, `g${typeof modInfo.flags === "string" ? modInfo.flags : ""}`);
      const replacement = typeof modInfo.with === "string" ? modInfo.with : "";
      const replace = (text: string) => modInfo.tagInsensitive
        ? text.replace(pattern, replacement)
        : splitByTags(text).map(part => part.startsWith("{@") ? part : part.replace(pattern, replacement)).join("");
      const props = Array.isArray(modInfo.props) ? modInfo.props : [null, "entries", "headerEntries", "footerEntries"];
      setPath(target, requirePath(), current.map(item => {
        if (typeof item === "string") return props.includes(null) ? replace(item) : item;
        if (!isRecord(item)) return item;
        for (const prop of props) {
          if (typeof prop === "string" && Object.hasOwn(item, prop)) {
            assertSafePath([prop]);
            item[prop] = walkStrings(item[prop], replace);
          }
        }
        return item;
      }));
      return;
    }
    case "setProp": {
      const extra = typeof modInfo.prop === "string" ? modInfo.prop.split(".") : [];
      setPath(target, [...(path ?? []), ...extra], structuredClone(modInfo.value));
      return;
    }
    case "prefixSuffixStringProp": {
      const fullPath = [...(path ?? []), ...(typeof modInfo.prop === "string" ? modInfo.prop.split(".") : [])];
      const current = getPath(target, fullPath);
      if (typeof current !== "string") return;
      const prefix = typeof modInfo.prefix === "string" ? modInfo.prefix : "";
      const suffix = typeof modInfo.suffix === "string" ? modInfo.suffix : "";
      setPath(target, fullPath, `${prefix}${current}${suffix}`);
      return;
    }
    default:
      throw new CopyError(`${label}: unsupported mode "${modInfo.mode}".`, "unsupported");
  }
}

function findReplaceIndex(values: unknown[], replace: unknown): number {
  if (isRecord(replace) && typeof replace.regex === "string") {
    const pattern = new RegExp(replace.regex, typeof replace.flags === "string" ? replace.flags : "");
    return values.findIndex(value => isRecord(value) && typeof value.name === "string"
      ? pattern.test(value.name)
      : typeof value === "string" && pattern.test(value));
  }
  if (isRecord(replace) && typeof replace.index === "number") return replace.index;
  return values.findIndex(value => isRecord(value) && value.name !== undefined ? value.name === replace : value === replace);
}

/** Splits text into plain runs and whole `{@tag ...}` / `{=prop}` runs, respecting nesting. */
export function splitByTags(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "{" && (next === "@" || next === "=")) {
      if (depth === 0 && current) {
        parts.push(current);
        current = "";
      }
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        parts.push(`${current}}`);
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

export function walkStrings(value: unknown, fn: (text: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map(item => walkStrings(item, fn));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walkStrings(item, fn)]));
  return value;
}

function assertSafePath(path: string[]): void {
  if (path.some(key => key === "__proto__" || key === "constructor" || key === "prototype")) {
    throw new CopyError("Unsupported prototype property in path.", "unsupported");
  }
}

export function getPath(target: unknown, path: string[]): unknown {
  assertSafePath(path);
  let current = target;
  for (const key of path) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function setPath(target: UpstreamRecord, path: string[], value: unknown): void {
  assertSafePath(path);
  if (path.length === 0) throw new CopyError("Expected a property path.", "unsupported");
  let current = target;
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(current, key) || !isRecord(current[key])) current[key] = {};
    current = current[key] as UpstreamRecord;
  }
  current[path[path.length - 1]] = value;
}

function deletePath(target: UpstreamRecord, path: string[]): void {
  assertSafePath(path);
  const parent = getPath(target, path.slice(0, -1));
  if (isRecord(parent)) delete parent[path[path.length - 1]];
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => deepEqual(a[key], b[key]));
  }
  return false;
}

function describe(record: unknown): string {
  if (!isRecord(record)) return "(record)";
  const source = typeof record.source === "string" ? record.source
    : isRecord(record.inherits) && typeof record.inherits.source === "string" ? record.inherits.source : "?";
  return `${typeof record.name === "string" ? record.name : "(unnamed)"}|${source}`;
}
