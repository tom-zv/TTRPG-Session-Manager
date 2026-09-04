import {
  SPELLCASTING_DISPLAYS,
  SPELL_FREQUENCIES,
  type DnD5eEntityDetails,
  type EntitySpellcasting,
  type SpellcastingLevel,
  type SpellEntry,
  type SpellFrequencyGroup,
} from "./entity.js";
import { isPlainObject } from "../settings.js";
import { validateEntitySettingsPatch } from "./settings.js";
import type { WriteIssue, WriteValidation } from "../../writeValidation.js";

/** Read-only provenance columns. A write never sets them: POST stores homebrew, the importer owns the rest. */
export type EntityProvenanceField = "source" | "page" | "imported" | "locallyEdited";
export type DnD5eEntityWrite = Omit<DnD5eEntityDetails, "templateId" | "createdAt" | "controllerUserIds" | EntityProvenanceField>;
export type CreateEntityRequest = DnD5eEntityWrite;

const NULLABLE_COLUMNS = [
  "imageUrl", "creatureType", "typeTags", "cr", "hpFormula", "speeds", "saves", "skills",
  "passivePerception", "languages", "legendaryHeader",
] as const satisfies readonly (keyof DnD5eEntityWrite)[];

type NullableColumn = typeof NULLABLE_COLUMNS[number];
export type UpdateEntityRequest = Partial<{
  [K in keyof DnD5eEntityWrite]: DnD5eEntityWrite[K] | (K extends NullableColumn ? null : never);
}>;

/**
 * The PUT body. Updating an entity that has an import identity returns 409 unless
 * `overwriteImported` confirms the in-place edit; the entity is then marked locally edited.
 */
export interface UpdateEntityBody {
  data: UpdateEntityRequest;
  overwriteImported?: true;
}

export type EntityWriteIssue = WriteIssue;

export const ENTITY_LIMITS = {
  name: 128,
  imageUrl: 256,
  creatureType: 64,
  cr: 8,
  hpFormula: 255,
  alignment: 64,
  sense: 128,
  entryName: 64,
  actionType: 64,
  conditionName: 64,
  conditionNote: 256,
  spellSource: 16,
  spellNote: 512,
  descriptionBytes: 65_535,
  tinyInt: [-128, 127],
  smallInt: [-32_768, 32_767],
  int: [-2_147_483_648, 2_147_483_647],
} as const;

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

const ROLES = ["pc", "npc", "creature"] as const satisfies readonly DnD5eEntityWrite["role"][];
const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const satisfies readonly DnD5eEntityWrite["size"][];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const DEFAULT_ABILITIES = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const descriptionEncoder = new TextEncoder();
// The sense key uses an accent- and case-insensitive Unicode collation in MySQL.
const senseCollator = new Intl.Collator("en", { sensitivity: "base" });
// Under the u flag a surrogate pair is one code point, so this matches only unpaired surrogates.
// MySQL's UTF-8 encoding would replace them with U+FFFD and could collide on a unique key.
const unpairedSurrogate = /\p{Cs}/u;

type Reader<T> = (value: unknown, path: string) => T | undefined;
type Input = Record<string, unknown>;

export function validateDnD5eEntityWrite(value: unknown, mode?: "create"): WriteValidation<CreateEntityRequest>;
export function validateDnD5eEntityWrite(value: unknown, mode: "update"): WriteValidation<UpdateEntityRequest>;
export function validateDnD5eEntityWrite(
  value: unknown,
  mode: "create" | "update" = "create",
): WriteValidation<CreateEntityRequest | UpdateEntityRequest> {
  if (!isPlainObject(value)) return { ok: false, issues: [{ path: "", message: "Entity data must be an object." }] };

  const issues: EntityWriteIssue[] = [];
  const limits = ENTITY_LIMITS;
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
    return undefined;
  };
  const optional = <T>(read: Reader<T>): Reader<T> => (raw, path) =>
    raw === undefined ? undefined : read(raw, path);
  const object: Reader<Input> = (raw, path) =>
    isPlainObject(raw) ? raw : issue(path, "Must be an object.");
  const text = (max?: number, required = false): Reader<string> => (raw, path) => {
    if (typeof raw !== "string") return issue(path, "Must be text.");
    if (unpairedSurrogate.test(raw)) return issue(path, "Must be valid Unicode text.");
    const trimmed = raw.trim();
    if (required && !trimmed) return issue(path, "Must not be empty.");
    if (max !== undefined && [...trimmed].length > max) {
      return issue(path, `Must have at most ${max} characters.`);
    }
    return trimmed;
  };
  const description: Reader<string> = (raw, path) => {
    const trimmed = text()(raw, path);
    if (trimmed !== undefined && descriptionEncoder.encode(trimmed).length > limits.descriptionBytes) {
      return issue(path, `Must have at most ${limits.descriptionBytes} UTF-8 bytes.`);
    }
    return trimmed;
  };
  const integer = (min: number, max: number): Reader<number> => (raw, path) =>
    typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max
      ? raw
      : issue(path, `Must be a whole number from ${min} to ${max}.`);
  const choice = <T extends string>(choices: readonly T[]): Reader<T> => (raw, path) => {
    const trimmed = typeof raw === "string" ? raw.trim() : undefined;
    return choices.find(candidate => candidate === trimmed)
      ?? issue(path, `Must be one of ${choices.join(", ")}.`);
  };
  const flag: Reader<boolean> = (raw, path) =>
    typeof raw === "boolean" ? raw : issue(path, "Must be true or false.");
  const list = <T>(read: Reader<T>, maxLength?: number): Reader<T[]> => (raw, path) => {
    if (!Array.isArray(raw)) return issue(path, "Must be an array.");
    if (maxLength !== undefined && raw.length > maxLength) {
      return issue(path, `Must have at most ${maxLength} entries.`);
    }
    const entries: T[] = [];
    for (const [index, item] of raw.entries()) {
      const parsed = read(item, `${path}.${index}`);
      if (parsed !== undefined) entries.push(parsed);
    }
    return entries;
  };
  const row = <T>(read: (entry: Input, path: string) => T | undefined): Reader<T> => (raw, path) => {
    const entry = object(raw, path);
    return entry && read(entry, path);
  };
  const map = <T>(read: Reader<T>, foldCase = false) => row((entry, path) => {
    const values = new Map<string, T>();
    for (const [key, raw] of Object.entries(entry)) {
      const trimmed = key.trim();
      const normalized = foldCase ? trimmed.toLowerCase() : trimmed;
      const keyPath = `${path}.${normalized}`;
      if (!normalized) {
        issue(path, "Keys must not be empty.");
      } else if (unpairedSurrogate.test(normalized)) {
        issue(path, "Keys must be valid Unicode text.");
      } else if (values.has(normalized)) {
        issue(keyPath, "Duplicate key.");
      } else {
        const parsed = read(raw, keyPath);
        if (parsed !== undefined) values.set(normalized, parsed);
      }
    }
    return Object.fromEntries(values);
  });

  const entryName = text(limits.entryName, true);
  const nonnegativeInt = integer(0, limits.int[1]);
  const maxOrderedRows = limits.smallInt[1] + 1; // Implicit sort orders start at zero.
  const strings = list(text());
  const traitFields = (entry: Input, path: string) => ({
    name: entryName(entry.name, `${path}.name`) ?? "",
    description: description(entry.description, `${path}.description`) ?? "",
    sortOrder: optional(integer(...limits.smallInt))(entry.sortOrder, `${path}.sortOrder`),
  });
  const action = row((entry, path) => ({
    ...traitFields(entry, path),
    actionType: optional(text(limits.actionType, true))(entry.actionType, `${path}.actionType`) ?? "action",
  }));
  const conditionNote = (entry: Input, path: string) =>
    optional(text(limits.conditionNote))(entry.conditionNote ?? undefined, `${path}.conditionNote`);
  const damage = row((entry, path) => ({
    damageType: choice(DAMAGE_TYPES)(
      typeof entry.damageType === "string" ? entry.damageType.toLowerCase() : entry.damageType,
      `${path}.damageType`,
    ) ?? "",
    conditionNote: conditionNote(entry, path),
  }));
  const condition = row((entry, path) => ({
    conditionName: text(limits.conditionName, true)(entry.conditionName, `${path}.conditionName`) ?? "",
    conditionNote: conditionNote(entry, path),
  }));
  const spell = row<SpellEntry>((entry, path) => ({
    name: entryName(entry.name, `${path}.name`) ?? "",
    source: optional(text(limits.spellSource))(entry.source, `${path}.source`),
    note: optional(text(limits.spellNote))(entry.note, `${path}.note`),
  }));
  const spells = list(spell, maxOrderedRows);
  const level = row<SpellcastingLevel>((entry, path) => {
    const spellLevel = integer(0, 9)(entry.level, `${path}.level`);
    const lowerLevel = optional(integer(0, spellLevel ?? 9))(entry.lowerLevel, `${path}.lowerLevel`);
    const slots = optional(nonnegativeInt)(entry.slots, `${path}.slots`);
    const entries = spells(entry.spells, `${path}.spells`);
    if (spellLevel === undefined || entries === undefined) return undefined;
    return { level: spellLevel, lowerLevel, slots, spells: entries };
  });
  const frequencyGroup = row<SpellFrequencyGroup>((entry, path) => {
    const frequency = choice(SPELL_FREQUENCIES)(entry.frequency, `${path}.frequency`);
    const count = optional(integer(1, Number.MAX_SAFE_INTEGER))(entry.count, `${path}.count`);
    const each = optional(flag)(entry.each, `${path}.each`);
    const entries = spells(entry.spells, `${path}.spells`);
    if (frequency === undefined || entries === undefined) return undefined;
    return { frequency, count, each, spells: entries };
  });
  const spellcasting = row<EntitySpellcasting>((entry, path) => {
    const seen = new Set<number>();
    const levels = optional(list((raw, levelPath) => {
      const group = level(raw, levelPath);
      if (group) {
        if (seen.has(group.level)) issue(`${levelPath}.level`, "Duplicate spell level.");
        seen.add(group.level);
      }
      return group;
    }))(entry.levels, `${path}.levels`);
    const frequencyGroups = optional(list(frequencyGroup))(entry.frequencyGroups, `${path}.frequencyGroups`);
    const spellCount = [...(levels ?? []), ...(frequencyGroups ?? [])]
      .reduce((total, group) => total + group.spells.length, 0);
    if (spellCount > maxOrderedRows) issue(path, `Must have at most ${maxOrderedRows} spells per block.`);
    return {
      name: entryName(entry.name, `${path}.name`) ?? "",
      displayAs: optional(choice(SPELLCASTING_DISPLAYS))(entry.displayAs, `${path}.displayAs`),
      ability: optional(choice(ABILITIES))(entry.ability, `${path}.ability`),
      saveDc: optional(integer(0, limits.tinyInt[1]))(entry.saveDc, `${path}.saveDc`),
      spellAttackBonus: optional(integer(...limits.tinyInt))(entry.spellAttackBonus, `${path}.spellAttackBonus`),
      descriptions: optional(list(description))(entry.descriptions, `${path}.descriptions`) ?? [],
      hideSpellList: optional(flag)(entry.hideSpellList, `${path}.hideSpellList`),
      levels,
      frequencyGroups,
    };
  });

  const read = <T>(key: keyof DnD5eEntityWrite, reader: Reader<T>) => optional(reader)(value[key], key);
  const nullable = <T>(key: NullableColumn, reader: Reader<T>) => optional(reader)(value[key] ?? undefined, key);
  const name = mode === "create"
    ? text(limits.name, true)(value.name, "name")
    : read("name", text(limits.name, true));
  const abilityScores = read("abilityScores", row((entry, path) => {
    const scores = ABILITIES.map(key => [key, nonnegativeInt(entry[key], `${path}.${key}`) ?? 0]);
    return Object.fromEntries(scores) as DnD5eEntityWrite["abilityScores"];
  }));
  const senses = read("senses", list(text(limits.sense, true)));
  const uniqueSenses = senses && deduplicateSenses(senses);
  const settings = read("settings", (raw, path) => {
    try {
      return validateEntitySettingsPatch(raw);
    } catch (error) {
      return issue(path, (error as Error).message);
    }
  });

  const fields = {
    name,
    imageUrl: nullable("imageUrl", text(limits.imageUrl)),
    role: read("role", choice(ROLES)),
    settings,
    creatureType: nullable("creatureType", text(limits.creatureType)),
    typeTags: nullable("typeTags", strings),
    cr: nullable("cr", text(limits.cr)),
    ac: read("ac", nonnegativeInt),
    hp: read("hp", nonnegativeInt),
    hpFormula: nullable("hpFormula", text(limits.hpFormula)),
    speeds: nullable("speeds", map(nonnegativeInt)),
    size: read("size", choice(SIZES)),
    alignment: read("alignment", text(limits.alignment)),
    abilityScores,
    saves: nullable("saves", map(text(undefined, true), true)),
    skills: nullable("skills", map(text(undefined, true), true)),
    passivePerception: nullable("passivePerception", integer(0, limits.smallInt[1])),
    senses: uniqueSenses,
    languages: nullable("languages", strings),
    resistances: read("resistances", list(damage)),
    immunities: read("immunities", list(damage)),
    vulnerabilities: read("vulnerabilities", list(damage)),
    conditionImmunities: read("conditionImmunities", list(condition)),
    traits: read("traits", list(row(traitFields), maxOrderedRows)),
    actions: read("actions", list(action, maxOrderedRows)),
    spellcasting: read("spellcasting", list(spellcasting, maxOrderedRows)),
    legendaryActionCount: read("legendaryActionCount", integer(0, limits.tinyInt[1])),
    legendaryHeader: nullable("legendaryHeader", strings),
  } satisfies Partial<DnD5eEntityWrite>;
  if (issues.length > 0) return { ok: false, issues };

  if (mode === "update") {
    const nullEntries = NULLABLE_COLUMNS.filter(key => value[key] === null).map(key => [key, null]);
    const cleared = Object.fromEntries(nullEntries) as Partial<Record<NullableColumn, null>>;
    const patch = { ...fields, ...cleared };
    return Object.values(patch).some(field => field !== undefined)
      ? { ok: true, value: patch }
      : { ok: false, issues: [{ path: "", message: "Update data is required." }] };
  }

  return { ok: true, value: {
    ...fields,
    name: name!,
    role: fields.role ?? "creature",
    ac: fields.ac ?? 10,
    hp: fields.hp ?? 1,
    speeds: fields.speeds ?? { walk: 30 },
    size: fields.size ?? "medium",
    alignment: fields.alignment ?? "unaligned",
    abilityScores: fields.abilityScores ?? { ...DEFAULT_ABILITIES },
  } };
}

/** Keep the first spelling and original order without comparing every pair of senses. */
function deduplicateSenses(senses: string[]): string[] {
  const sorted = senses.map((sense, index) => ({ sense, index }))
    .sort((a, b) => senseCollator.compare(a.sense, b.sense));
  const duplicates = new Set<number>();
  for (let index = 1; index < sorted.length; index++) {
    if (senseCollator.compare(sorted[index - 1].sense, sorted[index].sense) === 0) {
      duplicates.add(sorted[index].index);
    }
  }
  return senses.filter((_, index) => !duplicates.has(index));
}
