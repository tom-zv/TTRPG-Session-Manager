import { isRecord } from "./primitives.js";

// 5etools `_copy` inheritance within one record list (items.json and magicvariants.json internal
// copies, the bestiary across all its files, bestiary/template.json). A record names a parent by name
// and source, takes the parent's fields it does not set itself, then applies `_mod` operations in
// order. Mirrors the upstream copy applier (js/utils.js DataUtil.generic.copyApplier) for the
// operations the imported data uses; a `CopyProfile` holds what differs between data types.

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

export interface CopyProfile {
  /** Fields a copy takes from its parent only when `_preserve` names them. */
  preserveOnRequest: ReadonlySet<string>;
  /** Properties `_mod["*"]` applies to. Without it, "*" is unsupported. */
  starProps?: readonly string[];
  /** Templates `_copy._templates` may name, by lower-case name|source. Without it, templates are unsupported. */
  templates?: ReadonlyMap<string, UpstreamRecord>;
  /** Bestiary modes (addSkills, addSenses, addSpells, ...) and `<$...$>` variables. */
  creature?: boolean;
}

// Upstream _MERGE_REQUIRES_PRESERVE_BASE.
const PRESERVE_BASE = [
  "page", "otherSources", "referenceSources", "srd", "srd52", "basicRules", "basicRules2024", "reprintedAs",
  "hasFluff", "hasFluffImages", "hasToken", "tokenCredit", "tokenCustom", "foundryTokenScale", "altArt", "_versions",
];

/** Items: upstream base list plus the item page's own (DataUtil.item._MERGE_REQUIRES_PRESERVE). */
export const ITEM_COPY_PROFILE: CopyProfile = {
  preserveOnRequest: new Set([...PRESERVE_BASE, "lootTables", "tier"]),
};

/** Monster templates (bestiary/template.json `monsterTemplate`), copied within their own list. */
export const TEMPLATE_COPY_PROFILE: CopyProfile = {
  preserveOnRequest: new Set(PRESERVE_BASE),
};

// Upstream DataUtil.monster._MERGE_REQUIRES_PRESERVE and DataUtil.generic.COPY_ENTRY_PROPS.
const MONSTER_PRESERVE = [...PRESERVE_BASE, "legendaryGroup", "environment", "soundClip", "variant", "dragonCastingColor", "familiar"];
const MONSTER_ENTRY_PROPS = [
  "action", "bonus", "reaction", "trait", "legendary", "mythic", "variant", "spellcasting",
  "actionHeader", "bonusHeader", "reactionHeader", "legendaryHeader", "mythicHeader",
] as const;

/** Monsters, with the templates `_copy._templates` may apply. */
export function monsterCopyProfile(templates: ReadonlyMap<string, UpstreamRecord>): CopyProfile {
  return { preserveOnRequest: new Set(MONSTER_PRESERVE), starProps: MONSTER_ENTRY_PROPS, templates, creature: true };
}

export function resolveCopies(
  records: UpstreamRecord[],
  keyOf: (record: UpstreamRecord) => string,
  profile: CopyProfile = ITEM_COPY_PROFILE,
): CopyResolution {
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
      const result = applyCopy(structuredClone(parent), record, label, profile);
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

function applyCopy(parent: UpstreamRecord, record: UpstreamRecord, label: string, profile: CopyProfile): UpstreamRecord {
  const copyMeta = record._copy as UpstreamRecord;
  const preserve = isRecord(copyMeta._preserve) ? copyMeta._preserve : {};
  const result: UpstreamRecord = structuredClone(record);
  delete result._copy;
  const ownKeys = new Set(Object.keys(result));
  const mods = new Map<string, unknown[]>();
  const addMods = (value: unknown) => {
    if (!isRecord(value)) return;
    for (const [prop, modValue] of Object.entries(value)) {
      mods.set(prop, [...(mods.get(prop) ?? []), ...(Array.isArray(modValue) ? modValue : [modValue])]);
    }
  };
  addMods(structuredClone(copyMeta._mod));

  // Templates append their mods to the copy's own and set root fields the copy does not set itself.
  const templates = templatesOf(copyMeta, label, profile);
  for (const template of templates) addMods(isRecord(template.apply) ? template.apply._mod : undefined);

  for (const key of Object.keys(parent)) {
    if (result[key] === null) {
      delete result[key];
      continue;
    }
    if (Object.hasOwn(result, key) && result[key] !== undefined) continue;
    if (profile.preserveOnRequest.has(key) && !preserve["*"] && !preserve[key]) continue;
    Object.defineProperty(result, key, { value: parent[key], enumerable: true, configurable: true, writable: true });
  }
  for (const template of templates) {
    const root = isRecord(template.apply) && isRecord(template.apply._root) ? template.apply._root : {};
    for (const [key, value] of Object.entries(root)) {
      if (!ownKeys.has(key)) setPath(result, [key], value);
    }
  }

  if (mods.size === 0) return result;
  if (JSON.stringify([...mods]).includes("<$")) {
    if (!profile.creature) throw new CopyError(`${label}: _copy variables (<$...$>) are not supported.`, "unsupported");
    for (const [prop, modInfos] of mods) mods.set(prop, modInfos.map(modInfo => resolveVariables(modInfo, result, label)));
  }

  // Upstream applies "_" and "*" after named properties; "*" targets the entry properties.
  const entries = [...mods].sort(([a], [b]) => tailRank(a) - tailRank(b));
  for (const [prop, modInfos] of entries) {
    if (prop === "*" && !profile.starProps) throw new CopyError(`${label}: _mod "*" is not supported here.`, "unsupported");
    const paths = prop === "*" ? (profile.starProps ?? []).map(star => [star]) : [prop === "_" ? null : prop.split(".")];
    for (const path of paths) {
      if (path) assertSafePath(path);
      for (const modInfo of modInfos) applyMod(result, path, modInfo, `${label}: _mod ${prop}`, profile);
    }
  }
  return result;
}

function templatesOf(copyMeta: UpstreamRecord, label: string, profile: CopyProfile): UpstreamRecord[] {
  if (copyMeta._templates === undefined) return [];
  if (!profile.templates) throw new CopyError(`${label}: _copy templates are not supported.`, "unsupported");
  const refs = Array.isArray(copyMeta._templates) ? copyMeta._templates : [copyMeta._templates];
  return refs.map(ref => {
    const key = isRecord(ref) ? `${String(ref.name)}|${String(ref.source)}`.toLowerCase().trim() : "";
    const template = profile.templates?.get(key);
    if (!template) throw new CopyError(`${label}: template ${describe(ref)} not found.`, "unresolved");
    return structuredClone(template);
  });
}

const tailRank = (prop: string) => ["_", "*"].indexOf(prop);

function applyMod(target: UpstreamRecord, path: string[] | null, modInfo: unknown, label: string, profile: CopyProfile): void {
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
      if (profile.creature && applyCreatureMod(target, path, modInfo, label)) return;
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

// ─── Bestiary modes and variables ────────────────────────────────────────────

const SKILL_ABILITIES: Record<string, string> = {
  athletics: "str", acrobatics: "dex", "sleight of hand": "dex", stealth: "dex",
  arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
  "animal handling": "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
  deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
};
const ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const SIZES = ["F", "D", "T", "S", "M", "L", "H", "G", "C", "V"];
// Spell list keys that hold { "<count>[e]": spells[] } (upstream addSpells / removeSpells).
const SPELL_USE_PROPS = ["recharge", "legendary", "charges", "rest", "restLong", "daily", "weekly", "monthly", "yearly"];

const abilityMod = (score: unknown) => Math.floor((Number(score) - 10) / 2);
const signed = (value: number) => value >= 0 ? `+${value}` : String(value);
const sortLower = (values: unknown[]) => values.sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));

/** Upstream Parser.crToPb: CR below 5 gives +2, then +1 per 4 CR. */
function proficiencyBonus(cr: unknown): number {
  const value = isRecord(cr) ? cr.cr : cr;
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const [numerator, denominator] = String(value).split("/").map(Number);
  const number = denominator ? numerator / denominator : numerator;
  if (!Number.isFinite(number)) return 0;
  return number < 5 ? 2 : Math.ceil(number / 4) + 1;
}

/** Applies a bestiary-only mode; false when `modInfo.mode` is not one. */
function applyCreatureMod(target: UpstreamRecord, path: string[] | null, modInfo: UpstreamRecord, label: string): boolean {
  const scalar = typeof modInfo.scalar === "number" ? modInfo.scalar : 0;
  switch (modInfo.mode) {
    case "scalarAddProp":
    case "scalarMultProp": {
      // { save: { str: "+5" } } with prop "*" or one key; string bonuses keep their sign.
      const values = path ? getPath(target, path) : undefined;
      if (!isRecord(values)) return true;
      for (const key of modInfo.prop === "*" ? Object.keys(values) : [String(modInfo.prop)]) {
        let value = modInfo.mode === "scalarAddProp" ? Number(values[key]) + scalar : Number(values[key]) * scalar;
        if (modInfo.floor) value = Math.floor(value);
        values[key] = typeof values[key] === "string" ? signed(value) : value;
      }
      return true;
    }
    case "scalarAddHit":
    case "scalarAddDc": {
      const current = path ? getPath(target, path) : undefined;
      if (current === undefined || !path) return true;
      const shift = modInfo.mode === "scalarAddHit"
        ? (text: string) => text.replace(/\{@hit ([-+]?\d+)\}/g, (_match, bonus: string) => `{@hit ${Number(bonus) + scalar}}`)
        : (text: string) => text.replace(/\{@dc (\d+)(?:\|[^}]+)?\}/g, (_match, dc: string) => `{@dc ${Number(dc) + scalar}}`);
      setPath(target, path, walkStrings(current, shift));
      return true;
    }
    case "maxSize": {
      const sizes = Array.isArray(target.size) ? target.size.map(String) : [];
      const max = SIZES.indexOf(String(modInfo.max));
      const current = sizes.map(size => SIZES.indexOf(size));
      if (max === -1 || current.some(index => index === -1)) throw new CopyError(`${label}: maxSize with an unknown size.`, "unsupported");
      const kept = current.filter(index => index <= max).sort((a, b) => a - b);
      target.size = (kept.length ? kept : [max]).map(index => SIZES[index]);
      return true;
    }
    case "scalarMultXp":
      // The app derives XP from CR; only an explicit XP value is scaled.
      if (isRecord(target.cr) && typeof target.cr.xp === "number") {
        target.cr.xp = modInfo.floor ? Math.floor(target.cr.xp * scalar) : target.cr.xp * scalar;
      }
      return true;
    case "addSenses": {
      const senses = Array.isArray(target.senses) ? target.senses : [];
      for (const sense of Array.isArray(modInfo.senses) ? modInfo.senses : [modInfo.senses]) {
        if (!isRecord(sense) || typeof sense.type !== "string" || typeof sense.range !== "number") {
          throw new CopyError(`${label}: addSenses needs a type and a range.`, "unsupported");
        }
        const text = `${sense.type} ${sense.range} ft.`;
        const pattern = new RegExp(`${sense.type} (\\d+)`, "i");
        const index = senses.findIndex(existing => typeof existing === "string" && pattern.test(existing));
        if (index === -1) senses.push(text);
        else if (Number(pattern.exec(String(senses[index]))?.[1]) < sense.range) senses[index] = text;
      }
      target.senses = senses;
      return true;
    }
    case "addSkills":
    case "addSaves": {
      const [field, entries, abilityOf] = modInfo.mode === "addSkills"
        ? ["skill", modInfo.skills, (skill: string) => SKILL_ABILITIES[skill]] as const
        : ["save", modInfo.saves, (save: string) => ABILITIES.has(save) ? save : undefined] as const;
      if (!isRecord(entries)) throw new CopyError(`${label}: ${modInfo.mode} needs a map.`, "unsupported");
      const current = isRecord(target[field]) ? target[field] : {};
      for (const [name, multiplier] of Object.entries(entries)) {
        const ability = abilityOf(name);
        if (!ability) throw new CopyError(`${label}: unknown ${field} "${name}".`, "unsupported");
        // Proficiency (1) or expertise (2); never lowers an existing bonus.
        const total = Number(multiplier) * proficiencyBonus(target.cr) + abilityMod(target[ability]);
        if (current[name] === undefined || Number(current[name]) < total) current[name] = signed(total);
      }
      target[field] = current;
      return true;
    }
    case "addSpells":
    case "replaceSpells":
    case "removeSpells":
      applySpellMod(target, modInfo, label);
      return true;
    default:
      return false;
  }
}

function applySpellMod(target: UpstreamRecord, modInfo: UpstreamRecord, label: string): void {
  const blocks = Array.isArray(target.spellcasting) ? target.spellcasting : undefined;
  if (!blocks) throw new CopyError(`${label}: ${String(modInfo.mode)} on a creature without spellcasting.`, "unresolved");
  // Upstream: addSpells can name its block; the other two always change the first.
  const block = modInfo.mode === "addSpells" && typeof modInfo.name === "string"
    ? blocks.find(entry => isRecord(entry) && entry.name === modInfo.name)
    : blocks[0];
  if (!isRecord(block)) throw new CopyError(`${label}: no spellcasting block ${JSON.stringify(modInfo.name ?? 0)}.`, "unresolved");
  const slots = isRecord(block.spells) ? block.spells : undefined;
  const levels = isRecord(modInfo.spells) ? Object.entries(modInfo.spells) : [];

  if (modInfo.mode === "addSpells") {
    for (const [level, change] of levels) {
      if (!isRecord(change)) continue;
      const spells = slots ?? (block.spells = {}) as UpstreamRecord;
      const current = isRecord(spells[level]) ? spells[level] : (spells[level] = {}) as UpstreamRecord;
      for (const [key, value] of Object.entries(change)) {
        current[key] = Array.isArray(current[key]) && Array.isArray(value) ? sortLower([...current[key], ...value]) : value;
      }
    }
    for (const prop of ["constant", "will", "ritual"]) {
      if (Array.isArray(modInfo[prop])) block[prop] = [...(Array.isArray(block[prop]) ? block[prop] : []), ...modInfo[prop]];
    }
    for (const prop of SPELL_USE_PROPS) {
      if (!isRecord(modInfo[prop])) continue;
      const uses = isRecord(block[prop]) ? block[prop] : (block[prop] = {}) as UpstreamRecord;
      for (const [count, spells] of Object.entries(modInfo[prop])) {
        uses[count] = [...(Array.isArray(uses[count]) ? uses[count] : []), ...(Array.isArray(spells) ? spells : [])];
      }
    }
    return;
  }

  if (modInfo.mode === "replaceSpells") {
    const replace = (list: unknown, replacement: unknown) => {
      if (!Array.isArray(list) || !isRecord(replacement)) return;
      const index = list.indexOf(replacement.replace);
      if (index === -1) throw new CopyError(`${label}: no spell ${JSON.stringify(replacement.replace)} to replace.`, "unresolved");
      list.splice(index, 1, ...(Array.isArray(replacement.with) ? replacement.with : [replacement.with]));
      sortLower(list);
    };
    for (const [level, replacements] of levels) {
      const current = slots?.[level];
      if (!isRecord(current)) continue;
      for (const replacement of Array.isArray(replacements) ? replacements : []) replace(current.spells, replacement);
    }
    if (isRecord(modInfo.daily) && isRecord(block.daily)) {
      for (const [count, replacements] of Object.entries(modInfo.daily)) {
        for (const replacement of Array.isArray(replacements) ? replacements : []) replace(block.daily[count], replacement);
      }
    }
    return;
  }

  const without = (list: unknown, removed: unknown) => Array.isArray(list) && Array.isArray(removed)
    ? list.filter(spell => !removed.includes(spell))
    : list;
  for (const [level, removed] of levels) {
    const current = slots?.[level];
    if (isRecord(current) && Array.isArray(current.spells)) current.spells = without(current.spells, removed);
  }
  for (const prop of ["constant", "will", "ritual"]) {
    if (Array.isArray(modInfo[prop]) && Array.isArray(block[prop])) block[prop] = without(block[prop], modInfo[prop]);
  }
  for (const prop of SPELL_USE_PROPS) {
    const uses = block[prop];
    if (!isRecord(modInfo[prop]) || !isRecord(uses)) continue;
    for (const [count, spells] of Object.entries(modInfo[prop])) uses[count] = without(uses[count], spells);
  }
}

/** Upstream Renderer.monster.getShortName: "the goblin boss", "The goblin boss", or a named creature's first name. */
function shortName(creature: UpstreamRecord, titleCase: boolean): string {
  const named = creature.isNamedCreature === true;
  const name = typeof creature.name === "string" ? creature.name : "";
  const prefix = named ? "" : titleCase ? "The " : "the ";
  if (creature.shortName === true) return `${prefix}${name}`;
  if (typeof creature.shortName === "string") {
    const text = creature.shortName;
    return `${prefix}${!prefix && titleCase ? toTitleCase(text) : named ? text : text.toLowerCase()}`;
  }
  const base = name.split(",")[0].replace(/(?:adult|ancient|young) \w+ (dragon|dracolich)/gi, "$1");
  const short = named ? base.split(" ")[0] : base.toLowerCase();
  return `${prefix}${short}`;
}

const toTitleCase = (text: string) => text.replace(/\b\w/g, char => char.toUpperCase());

/** Resolves `<$mode__detail$>` variables against the copy (upstream DataUtil.generic.variableResolver). */
function resolveVariables(value: unknown, creature: UpstreamRecord, label: string): unknown {
  return walkStrings(value, text => text.replace(/<\$([^$]+)\$>/g, (match, variable: string) => {
    const [mode, detail = ""] = variable.split("__");
    const needsAbility = () => {
      if (!ABILITIES.has(detail)) throw new CopyError(`${label}: unknown ability "${detail}" in ${match}.`, "unsupported");
      return detail;
    };
    switch (mode) {
      case "name": return typeof creature.name === "string" ? creature.name : match;
      case "short_name": return shortName(creature, false);
      case "title_short_name": return shortName(creature, true);
      case "dc":
      case "spell_dc": return String(8 + abilityMod(creature[needsAbility()]) + proficiencyBonus(creature.cr));
      case "to_hit": return signed(proficiencyBonus(creature.cr) + abilityMod(creature[needsAbility()]));
      case "damage_mod": {
        const mod = abilityMod(creature[needsAbility()]);
        return mod === 0 ? "" : mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`;
      }
      case "damage_avg": {
        // "2.5+str": dice average plus ability modifiers, rounded down.
        const expression = detail
          .replace(/\b(str|dex|con|int|wis|cha)\b/gi, ability => `(${abilityMod(creature[ability.toLowerCase()])})`)
          .replace(/\bsize_mult\b/g, () => String(sizeMultiplier(creature)));
        const value = evaluateArithmetic(expression);
        if (value === undefined) throw new CopyError(`${label}: cannot evaluate ${match}.`, "unsupported");
        return String(Math.floor(value));
      }
      default:
        throw new CopyError(`${label}: _copy variable ${match} is not supported.`, "unsupported");
    }
  }));
}

const sizeMultiplier = (creature: UpstreamRecord) => {
  const size = Array.isArray(creature.size) ? String(creature.size[0]) : "M";
  return ({ L: 2, H: 3, G: 4 } as Record<string, number>)[size] ?? 1;
};

/** Evaluates + - * / and parentheses over numbers; undefined for anything else. */
export function evaluateArithmetic(expression: string): number | undefined {
  const tokens = expression.match(/\d+(?:\.\d+)?|[-+*/()]|\S/g) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const factor = (): number => {
    const token = tokens[position++];
    if (token === "-") return -factor();
    if (token === "+") return factor();
    if (token === "(") {
      const value = sum();
      if (tokens[position++] !== ")") throw new Error("unbalanced");
      return value;
    }
    if (token !== undefined && /^\d/.test(token)) return Number(token);
    throw new Error("unexpected token");
  };
  const product = (): number => {
    let value = factor();
    while (peek() === "*" || peek() === "/") value = tokens[position++] === "*" ? value * factor() : value / factor();
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") value = tokens[position++] === "+" ? value + product() : value - product();
    return value;
  };
  try {
    const value = sum();
    return position === tokens.length && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
