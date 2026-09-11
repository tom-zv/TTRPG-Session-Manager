import type { EntityAction, EntityTrait } from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import {
  ABILITY_FULL_NAMES,
  calcMod,
  formatSignedNumber,
  titleCase,
  type AbilityKey,
} from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { fail, type FieldParse, type FieldSpec, type TokenListSpec } from "../../../sheetEditor/fieldSpec.js";
import { parseWhole } from "../../../sheetEditor/InlineField.js";
import { clearable, keepAbsent } from "../../../sheetEditor/PopoverForm.js";
import { descriptionTooLong } from "../../../sheetEditor/EntryCardFrame.js";
import { MAX_ABILITY_SCORE, MAX_LEGENDARY_COUNT, MAX_PASSIVE_PERCEPTION, MAX_WHOLE, textProblem } from "../editors/fieldLimits.js";
import { getProficiencyBonusForCr, getRecordDefaultValue, type RecordEntryMode } from "./calculations.js";
import type { EntityDraft } from "./defaults.js";
import { carryEntryKey, entryKey } from "./entryKeys.js";
import { draftEntries, insertItem, readLayout, writeLayout, type LayoutItem } from "./entryLayout.js";
import { getAutoPassivePerception, type EntityDraftModes, type ProficiencyField } from "./inference.js";
import {
  ALIGNMENT_OPTIONS,
  CONDITION_OPTIONS,
  CREATURE_TYPE_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  ROLE_OPTIONS,
  SAVE_OPTIONS,
  SENSE_OPTIONS,
  SIZE_OPTIONS,
  SKILL_OPTIONS,
} from "./options.js";

/**
 * The entity sheet's editable values, each defined once. The live presentation draws a spec as a
 * field on the sheet; the targets presentation draws the same spec inside the target's editor.
 */
export type EntityField = FieldSpec<EntityDraft, EntityDraftModes>;
export type EntityTokens = TokenListSpec<EntityDraft, EntityDraftModes>;
type EntityParse = FieldParse<EntityDraft, EntityDraftModes>;

const ok = (patch: Partial<EntityDraft>, modes?: Partial<EntityDraftModes>): EntityParse => ({ ok: true, patch, ...(modes ? { modes } : {}) });

/** A whole number from 0 to `max`, or the message both presentations show. */
export const parseWholeText = (text: string, max: number): { ok: true; value: number } | { ok: false; message: string } => {
  const value = parseWhole(text, 0, max);
  return value === undefined ? fail(`A whole number from 0 to ${max}.`) : { ok: true, value };
};

const wholeField = (text: string, max: number, patch: (value: number) => Partial<EntityDraft>): EntityParse => {
  const result = parseWholeText(text, max);
  return result.ok ? ok(patch(result.value)) : result;
};

const textField = (text: string, max: number, patch: () => Partial<EntityDraft>): EntityParse => {
  const problem = textProblem(text, max);
  return problem ? fail(problem) : ok(patch());
};

// Header ------------------------------------------------------------------------------------------

export const NAME_FIELD: EntityField = {
  id: "name",
  label: "Name",
  placeholder: "Name",
  read: draft => draft.name,
  parse: text => {
    const name = text.trim();
    if (!name) return fail("A name is required.");
    return textField(name, ENTITY_LIMITS.name, () => ({ name }));
  },
};

// The subtitle's fields. On targets an issue on any of them opens the subtitle (see `issueTargets.ts`).
export const SIZE_FIELD: EntityField = {
  id: "size",
  label: "Size",
  options: SIZE_OPTIONS,
  read: draft => draft.size,
  parse: text => {
    const size = SIZE_OPTIONS.find(option => option.value === text)?.value;
    return size ? ok({ size }) : fail("Choose a size.");
  },
};

export const CREATURE_TYPE_FIELD: EntityField = {
  id: "creatureType",
  label: "Creature type",
  placeholder: "type",
  suggestions: CREATURE_TYPE_OPTIONS,
  read: draft => draft.creatureType ?? "",
  parse: (text, draft) => textField(text, ENTITY_LIMITS.creatureType, () => ({ creatureType: clearable(text, draft.creatureType) })),
};

export const ALIGNMENT_FIELD: EntityField = {
  id: "alignment",
  label: "Alignment",
  placeholder: "alignment",
  suggestions: ALIGNMENT_OPTIONS,
  read: draft => draft.alignment,
  parse: text => textField(text, ENTITY_LIMITS.alignment, () => ({ alignment: text.trim() })),
};

export const ROLE_FIELD: EntityField = {
  id: "role",
  label: "Role",
  options: ROLE_OPTIONS,
  read: draft => draft.role,
  parse: text => {
    const role = ROLE_OPTIONS.find(option => option.value === text)?.value;
    return role ? ok({ role }) : fail("Choose a role.");
  },
};

export const TYPE_TAGS: EntityTokens = {
  id: "typeTags",
  label: "Type tags",
  noun: "tag",
  read: draft => draft.typeTags ?? [],
  check: tag => textProblem(tag, undefined, true),
  write: (typeTags, draft) => ok({ typeTags: keepAbsent(typeTags, draft.typeTags) }),
};

export const AC_FIELD: EntityField = {
  id: "ac",
  label: "Armor Class",
  inputMode: "numeric",
  read: draft => String(draft.ac),
  parse: text => wholeField(text, MAX_WHOLE, ac => ({ ac })),
};

export const HP_FIELD: EntityField = {
  id: "hp",
  label: "Hit points",
  inputMode: "numeric",
  read: draft => String(draft.hp),
  parse: text => wholeField(text, MAX_WHOLE, hp => ({ hp })),
};

export const HP_FORMULA_FIELD: EntityField = {
  id: "hpFormula",
  label: "Hit point formula",
  placeholder: "(formula)",
  read: draft => draft.hpFormula ?? "",
  parse: (text, draft) => textField(text, ENTITY_LIMITS.hpFormula, () => ({ hpFormula: clearable(text, draft.hpFormula) })),
};

/** One speed's feet; clearing it removes that speed. */
export const speedField = (type: string): EntityField => ({
  id: `speeds.${type}`,
  label: `${titleCase(type)} speed in feet`,
  inputMode: "numeric",
  read: draft => String(draft.speeds?.[type] ?? ""),
  parse: (text, draft) => {
    const speeds = draft.speeds ?? {};
    if (text.trim() === "") return ok({ speeds: Object.fromEntries(Object.entries(speeds).filter(([other]) => other !== type)) });
    return wholeField(text, MAX_WHOLE, feet => ({ speeds: { ...speeds, [type]: feet } }));
  },
});

export type SpeedRow = { type: string; feet: string };

/**
 * The speeds editor's rows as one patch: each row is committed through `speedField`, as the live
 * field commits it (blank feet removes the speed). An empty list leaves an absent map absent.
 */
export const parseSpeedRows = (rows: readonly SpeedRow[], draft: EntityDraft, modes: EntityDraftModes): EntityParse => {
  if (rows.length === 0 && !draft.speeds) return ok({});
  let next: EntityDraft = { ...draft, speeds: {} };
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.type)) return fail(`Speed type ${row.type} is listed twice.`);
    seen.add(row.type);
    const spec = speedField(row.type);
    const result = spec.parse(row.feet, next, modes);
    if (!result.ok) return fail(`${spec.label}: ${result.message}`);
    next = { ...next, ...result.patch };
  }
  return ok({ speeds: next.speeds });
};

export const STANDARD_CRS: readonly string[] = [
  "0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, index) => String(index + 1)),
];

export const CR_FIELD: EntityField = {
  id: "cr",
  label: "Challenge Rating",
  placeholder: "—",
  suggestions: STANDARD_CRS.map(cr => ({ value: cr, label: cr })),
  read: draft => draft.cr ?? "",
  parse: text => {
    const cr = text.trim();
    if (cr !== "" && !STANDARD_CRS.includes(cr)) return fail("Use 0, 1/8, 1/4, 1/2 or 1 to 30.");
    return ok({ cr: cr === "" ? null : cr });
  },
};

export const ABILITY_ORDER: readonly AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const abilityScoreField = (ability: AbilityKey): EntityField => ({
  id: `abilityScores.${ability}`,
  label: `${ABILITY_FULL_NAMES[ability]} score`,
  inputMode: "numeric",
  read: draft => String(draft.abilityScores[ability]),
  parse: (text, draft) => wholeField(text, MAX_ABILITY_SCORE, score => ({ abilityScores: { ...draft.abilityScores, [ability]: score } })),
});

// Saves and skills --------------------------------------------------------------------------------

/** A save or skill's mode: "none" means the record does not list it. */
export type RecordMode = RecordEntryMode | "none";

const RECORD_OPTIONS = { saves: SAVE_OPTIONS, skills: SKILL_OPTIONS };

/** The value a save or skill has in a computed mode, or undefined when the key has no ability. */
export const recordValue = (draft: EntityDraft, field: ProficiencyField, key: string, mode: Exclude<RecordEntryMode, "custom">): number | undefined =>
  getRecordDefaultValue(key, RECORD_OPTIONS[field], draft.abilityScores, getProficiencyBonusForCr(draft.cr), mode);

/** A custom modifier's text: required, and within the write contract's text rule. */
export const recordValueProblem = (value: string): string | undefined => textProblem(value, undefined, true);

/**
 * Writes one save or skill: a computed mode recomputes its value, "none" removes it, and a custom
 * value is stored as typed. Modes travel with the record so a reload infers the same ones.
 */
export const writeRecord = (
  draft: EntityDraft,
  modes: EntityDraftModes,
  field: ProficiencyField,
  key: string,
  mode: RecordMode,
  custom?: string,
): EntityParse => {
  const record = { ...(draft[field] ?? {}) };
  const nextModes = { ...modes[field] };
  if (mode === "none") {
    delete record[key];
    delete nextModes[key];
  } else if (mode === "custom") {
    const value = (custom ?? record[key] ?? "").trim();
    const problem = recordValueProblem(value);
    if (problem) return fail(problem);
    record[key] = value;
    nextModes[key] = "custom";
  } else {
    const value = recordValue(draft, field, key, mode);
    if (value === undefined) return fail("This needs a custom modifier.");
    record[key] = formatSignedNumber(value);
    nextModes[key] = mode;
  }
  const patch = Object.keys(record).length === 0 && !draft[field] ? draft[field] : record;
  return ok({ [field]: patch }, { [field]: nextModes });
};

/** A row of the saves or skills editor: a key and its mode, and the stored entry it started from. */
export type RecordRow = {
  key: string;
  mode: RecordMode;
  custom: string;
  original?: { key: string; mode: RecordEntryMode; value: string };
};

/**
 * The saves or skills editor's rows as one patch. Each row is written with `writeRecord`, as a
 * typed value or a marker press is; a row that still means what it did keeps its stored value
 * (+2 on Strength is not +2 on Dexterity, so a new key or mode recomputes it). A failure names
 * the row by `labelOf`.
 */
export const writeRecordRows = (
  draft: EntityDraft,
  modes: EntityDraftModes,
  field: ProficiencyField,
  rows: readonly RecordRow[],
  labelOf: (key: string) => string,
): EntityParse => {
  let next: EntityDraft = { ...draft, [field]: {} };
  let nextModes: EntityDraftModes = { ...modes, [field]: {} };
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.mode === "none") continue;
    const key = row.key.trim().toLowerCase();
    const label = labelOf(row.key);
    if (seen.has(key)) return fail(`${label} is listed twice.`);
    seen.add(key);
    const { original } = row;
    const unchanged = original?.key === row.key && original.mode === row.mode && (row.mode !== "custom" || row.custom === original.value);
    let result: EntityParse;
    if (original && unchanged) {
      result = ok({ [field]: { ...next[field], [key]: original.value } }, { [field]: { ...nextModes[field], [key]: original.mode } });
    } else if (row.mode === "custom" && !row.custom.trim()) {
      return fail(`Give ${label} a modifier, or choose another mode.`);
    } else {
      result = writeRecord(next, nextModes, field, key, row.mode, row.custom);
    }
    if (!result.ok) return fail(`${label}: ${result.message}`);
    next = { ...next, ...result.patch };
    nextModes = { ...nextModes, ...result.modes };
  }
  const record = next[field] ?? {};
  return ok({ [field]: Object.keys(record).length === 0 && !draft[field] ? draft[field] : record }, { [field]: nextModes[field] });
};

const MODIFIER = /^[+-]?\d+$/;

/**
 * A typed save or skill value: it takes the mode it equals (the plain modifier is no proficiency,
 * for a save), and any other text is a custom value. Blank removes it.
 */
const parseRecordText = (field: ProficiencyField, key: string, text: string, draft: EntityDraft, modes: EntityDraftModes): EntityParse => {
  const value = text.trim();
  if (!value) return writeRecord(draft, modes, field, key, "none");
  const problem = recordValueProblem(value);
  if (problem) return fail(problem);
  if (MODIFIER.test(value)) {
    const number = Number(value);
    const option = RECORD_OPTIONS[field].find(candidate => candidate.value === key);
    if (field === "saves" && option && number === calcMod(draft.abilityScores[option.ability])) return writeRecord(draft, modes, field, key, "none");
    if (number === recordValue(draft, field, key, "proficient")) return writeRecord(draft, modes, field, key, "proficient");
    if (number === recordValue(draft, field, key, "expertise")) return writeRecord(draft, modes, field, key, "expertise");
  }
  return writeRecord(draft, modes, field, key, "custom", value);
};

/** The mode a stored save or skill is in: absent is "none", an unknown one "custom". */
export const recordMode = (draft: EntityDraft, modes: EntityDraftModes, field: ProficiencyField, key: string): RecordMode =>
  draft[field]?.[key] === undefined ? "none" : (modes[field][key] ?? "custom");

/** A save cell: the stored save, or the plain modifier when the entity is not proficient. */
export const saveField = (ability: AbilityKey): EntityField => ({
  id: `saves.${ability}`,
  label: `${ABILITY_FULL_NAMES[ability]} saving throw`,
  read: draft => draft.saves?.[ability] ?? formatSignedNumber(calcMod(draft.abilityScores[ability])),
  parse: (text, draft, modes) => parseRecordText("saves", ability, text, draft, modes),
});

/** A skill's name as the sheet prints it ("Sleight of Hand"); an unknown key in title case. */
export const skillLabel = (key: string) => SKILL_OPTIONS.find(option => option.value === key)?.label ?? titleCase(key);

export const skillField = (key: string): EntityField => ({
  id: `skills.${key}`,
  label: `${skillLabel(key)} modifier`,
  read: draft => draft.skills?.[key] ?? "",
  parse: (text, draft, modes) => parseRecordText("skills", key, text, draft, modes),
});

/** The next mode a mode marker press gives: none → proficient → expertise → none. */
export const nextRecordMode = (field: ProficiencyField, mode: RecordMode): RecordMode => {
  if (mode === "proficient") return "expertise";
  if (mode === "expertise") return field === "saves" ? "none" : "proficient";
  return "proficient";
};

export const RECORD_MODE_NAMES: Record<RecordMode, string> = {
  none: "not proficient",
  proficient: "proficient",
  expertise: "expertise",
  custom: "custom",
};

// Info lines --------------------------------------------------------------------------------------

/** Passive Perception: automatic (from Perception) when blank or equal to the computed value. */
export const PASSIVE_PERCEPTION_FIELD: EntityField = {
  id: "passivePerception",
  label: "Passive Perception",
  inputMode: "numeric",
  read: (draft, modes) => String(modes.passivePerception === "auto" ? getAutoPassivePerception(draft) : (draft.passivePerception ?? "")),
  parse: (text, draft) => {
    const auto = getAutoPassivePerception(draft);
    if (text.trim() === "") return ok({}, { passivePerception: "auto" });
    const result = parseWholeText(text, MAX_PASSIVE_PERCEPTION);
    if (!result.ok) return result;
    return result.value === auto ? ok({}, { passivePerception: "auto" }) : ok({ passivePerception: result.value }, { passivePerception: "manual" });
  },
};

export const SENSES: EntityTokens = {
  id: "senses",
  label: "Senses",
  noun: "sense",
  suggestions: SENSE_OPTIONS,
  read: draft => draft.senses ?? [],
  check: sense => textProblem(sense, ENTITY_LIMITS.sense, true),
  write: (senses, draft) => ok({ senses: keepAbsent(senses, draft.senses) }),
};

export const LANGUAGES: EntityTokens = {
  id: "languages",
  label: "Languages",
  noun: "language",
  suggestions: LANGUAGE_OPTIONS,
  read: draft => draft.languages ?? [],
  check: language => textProblem(language, undefined, true),
  write: (languages, draft) => ok({ languages: keepAbsent(languages, draft.languages) }),
};

export type DefenseField = "resistances" | "immunities" | "vulnerabilities" | "conditionImmunities";
export type DefenseRow = { name: string; note: string };

export const DEFENSE_NOUNS: Record<DefenseField, string> = {
  resistances: "resistance",
  immunities: "immunity",
  vulnerabilities: "vulnerability",
  conditionImmunities: "condition immunity",
};

const DEFENSE_LABELS: Record<DefenseField, string> = {
  resistances: "Resistances",
  immunities: "Immunities",
  vulnerabilities: "Vulnerabilities",
  conditionImmunities: "Condition Immunities",
};

export const defenseOptions = (field: DefenseField) => (field === "conditionImmunities" ? CONDITION_OPTIONS : DAMAGE_TYPE_OPTIONS);

/** A defense row's note fits the write contract. */
export const defenseNoteProblem = (row: DefenseRow): string | undefined => {
  const problem = textProblem(row.note, ENTITY_LIMITS.conditionNote);
  return problem ? `Note for ${row.name.trim().toLowerCase()}: ${problem}` : undefined;
};

const defenseKey = (name: string) => name.trim().toLowerCase();

/** "fire (from nonmagical attacks)": the type, then the note in parentheses, as the sheet prints it. */
const splitDefense = (token: string): DefenseRow => {
  const match = /^(.*?)\s*\((.*)\)\s*$/s.exec(token);
  return match ? { name: match[1].trim(), note: match[2].trim() } : { name: token.trim(), note: "" };
};

const formatDefense = (row: DefenseRow) => (row.note ? `${row.name} (${row.note})` : row.name);

const NOTE_ONLY = /^\((.*)\)$/s;

/**
 * A typed defense as a row, against the names stored on its line: a stored name keeps its own
 * parentheses ("Dazed (magical) (while raging)" is that condition with the note "while raging").
 * Otherwise the note is the parenthesised end, as `splitDefense` reads it.
 */
const readDefense = (field: DefenseField, token: string, draft: EntityDraft, index?: number): DefenseRow => {
  const typed = token.trim();
  const lower = typed.toLowerCase();
  const rows = defenseRows(field, draft);
  const indexedName = index === undefined ? undefined : rows[index]?.name;
  const storedNames = [...new Set(rows.map(row => row.name))].sort((left, right) => right.length - left.length);
  const names = indexedName
    ? [indexedName, ...storedNames.filter(name => name !== indexedName)]
    : storedNames;
  for (const name of names) {
    if (!lower.startsWith(name.toLowerCase())) continue;
    const rest = typed.slice(name.length).trim();
    if (rest === "") return { name, note: "" };
    const note = NOTE_ONLY.exec(rest);
    if (note) return { name, note: note[1].trim() };
  }
  return splitDefense(typed);
};

export const defenseRows = (field: DefenseField, draft: EntityDraft): DefenseRow[] =>
  (draft[field] ?? []).map(entry => ({
    name: "damageType" in entry ? entry.damageType : entry.conditionName,
    note: entry.conditionNote ?? "",
  }));

/** The stored row a row is identical to, so it is written back exactly as stored. */
const storedIndex = (field: DefenseField, draft: EntityDraft, row: DefenseRow) =>
  defenseRows(field, draft).findIndex(stored => stored.name === row.name && stored.note === row.note);

/**
 * A changed defense's problem. A damage type must be one of the 13 types. A condition must be one
 * of the conditions, or a name already stored on this line (the write contract allows any name,
 * and the editors keep offering it). Its note must fit.
 */
const defenseRowProblem = (field: DefenseField, row: DefenseRow, draft: EntityDraft): string | undefined => {
  const name = defenseKey(row.name);
  const known = defenseOptions(field).some(option => option.value === name)
    || (field === "conditionImmunities" && defenseRows(field, draft).some(stored => defenseKey(stored.name) === name));
  if (!known) return field === "conditionImmunities" ? `${row.name} is not a condition.` : `${row.name} is not a damage type.`;
  return defenseNoteProblem(row);
};

/** The draft value for a defense line's rows. A row identical to a stored one keeps that stored entry. */
export const writeDefenseRows = (field: DefenseField, rows: readonly DefenseRow[], draft: EntityDraft): Partial<EntityDraft> => {
  if (rows.length === 0 && !draft[field]) return {};
  const stored = draft[field] ?? [];
  const note = (row: DefenseRow) => (row.note.trim() ? { conditionNote: row.note.trim() } : {});
  const entry = <E,>(row: DefenseRow, make: () => E): E => {
    const index = storedIndex(field, draft, row);
    return index === -1 ? make() : stored[index] as E;
  };
  return field === "conditionImmunities"
    ? { conditionImmunities: rows.map(row => entry(row, () => ({ conditionName: row.name, ...note(row) }))) }
    : { [field]: rows.map(row => entry(row, () => ({ damageType: row.name, ...note(row) }))) };
};

/**
 * A defense line's rows as one patch, for both presentations: a type is listed once, and a row
 * that is not identical to a stored one passes `defenseRowProblem`. Stored rows are left as they are.
 */
export const parseDefenseRows = (field: DefenseField, rows: readonly DefenseRow[], draft: EntityDraft): EntityParse => {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = defenseKey(row.name);
    if (seen.has(key)) return fail(`${row.name} is listed twice.`);
    seen.add(key);
    if (storedIndex(field, draft, row) !== -1) continue;
    const problem = defenseRowProblem(field, row, draft);
    if (problem) return fail(problem);
  }
  return ok(writeDefenseRows(field, rows, draft));
};

/**
 * A defense line as tokens, typed as the sheet prints them ("fire (note)"). Only the edited token
 * is read back from text; every other token stays the stored row it shows.
 */
export const defenseTokens = (field: DefenseField): EntityTokens => {
  const rowOf = (token: string, draft: EntityDraft, index?: number): DefenseRow =>
    readDefense(field, token, draft, index);
  return {
    id: field,
    label: DEFENSE_LABELS[field],
    noun: DEFENSE_NOUNS[field],
    suggestions: defenseOptions(field),
    read: draft => defenseRows(field, draft).map(formatDefense),
    key: (token, draft, index) => defenseKey(readDefense(field, token, draft, index).name),
    check: (token, draft, index) => {
      const row = rowOf(token, draft, index);
      return storedIndex(field, draft, row) === -1 ? defenseRowProblem(field, row, draft) : undefined;
    },
    // A known type is stored as listed; a stored condition keeps its own spelling.
    normalize: (token, draft, index) => {
      const row = readDefense(field, token, draft, index);
      const stored = defenseRows(field, draft).find(other => defenseKey(other.name) === defenseKey(row.name));
      return formatDefense({ name: stored?.name ?? defenseKey(row.name), note: row.note });
    },
    // A token is read against the stored row it came from, so removing an earlier token keeps it.
    write: (tokens, draft, _modes, origins) =>
      parseDefenseRows(field, tokens.map((token, index) => rowOf(token, draft, origins ? origins[index] : index)), draft),
  };
};

// Entries -----------------------------------------------------------------------------------------

export const LEGENDARY_COUNT_FIELD: EntityField = {
  id: "legendaryActionCount",
  label: "Legendary actions per round",
  inputMode: "numeric",
  placeholder: "—",
  read: draft => (draft.legendaryActionCount ? String(draft.legendaryActionCount) : ""),
  parse: text => (text.trim() === "" ? ok({ legendaryActionCount: 0 }) : wholeField(text, MAX_LEGENDARY_COUNT, count => ({ legendaryActionCount: count }))),
};

/** A text entry's row: a trait, or an action of any section. */
export type TextEntryRow = EntityTrait | EntityAction;

/**
 * A trait or action added on the sheet that is not in the draft yet: it joins the draft, in
 * `sectionKey`, when its name or text is first applied, and is dropped if it is left blank.
 */
export type AddedEntry = { row: TextEntryRow; list: "traits" | "actions"; sectionKey: string };

/**
 * One text entry field (name or text). Like a field spec, but its entry is found by its key rather
 * than its position, so a move does not hand its field, or text typed into it, to another entry;
 * `read` is undefined once the entry is gone.
 */
export type EntryField = {
  /** The issue target id: the validator path, `actions.3.name`. */
  id: string;
  label: string;
  read: (draft: EntityDraft) => string | undefined;
  parse: (text: string, draft: EntityDraft, modes: EntityDraftModes) => EntityParse;
};

/** An entry field as a field spec, for the targets presentation's inline editor. */
export const entryFieldSpec = (field: EntryField): EntityField => ({ ...field, read: draft => field.read(draft) ?? "" });

/** Where the entry with this key is now: its list, its index and its row. */
export const findEntry = (draft: EntityDraft, key: number): { list: "traits" | "actions"; index: number; row: TextEntryRow } | null => {
  for (const list of ["traits", "actions"] as const) {
    const rows: readonly TextEntryRow[] = draft[list] ?? [];
    const index = rows.findIndex(row => entryKey(row) === key);
    if (index >= 0) return { list, index, row: rows[index] };
  }
  return null;
};

/**
 * A content edit of one entry: its row replaced where it is stored, every other row in place. An
 * added entry that is not in the draft yet is inserted where the sheet shows it instead.
 */
const writeEntry = (
  draft: EntityDraft,
  modes: EntityDraftModes,
  key: number,
  added: AddedEntry | undefined,
  change: (row: TextEntryRow) => TextEntryRow,
): EntityParse => {
  const found = findEntry(draft, key);
  if (found) {
    if (found.list === "traits") {
      const traits = [...(draft.traits ?? [])];
      traits[found.index] = carryEntryKey(found.row, change(found.row));
      return ok({ traits });
    }
    const actions = [...(draft.actions ?? [])];
    actions[found.index] = carryEntryKey(found.row, change(found.row) as EntityAction);
    return ok({ actions });
  }
  if (!added) return fail("This entry was removed.");
  const value = carryEntryKey(added.row, change(added.row));
  const item: LayoutItem = added.list === "traits" ? { kind: "trait", value } : { kind: "action", value: value as EntityAction };
  const layout = readLayout(draftEntries(draft), modes.spellcasting);
  return ok(writeLayout(layout, insertItem(layout, added.sectionKey, item), new Set([added.list])).patch);
};

/**
 * The name and text of a trait or action, addressed by its key. `id` is the entry's validator
 * path (`actions.3`), so the fields are `actions.3.name` and `actions.3.description`.
 */
export const entryFields = (
  { key, id, place, added }: { key: number; id: string; place: string; added?: AddedEntry },
): { name: EntryField; text: EntryField } => {
  const current = (draft: EntityDraft) => findEntry(draft, key)?.row ?? added?.row;
  return {
    name: {
      id: `${id}.name`,
      label: `Name of ${place}`,
      read: draft => current(draft)?.name,
      parse: (text, draft, modes) => {
        const row = current(draft);
        // A blank entry may have no name; it is removed once it is left blank.
        const problem = textProblem(text, ENTITY_LIMITS.entryName, Boolean(row?.description.trim()));
        if (problem) return fail(`Name: ${problem}`);
        return writeEntry(draft, modes, key, added, entry => ({ ...entry, name: text.trim() }));
      },
    },
    text: {
      id: `${id}.description`,
      label: `Text of ${place}`,
      read: draft => current(draft)?.description,
      parse: (text, draft, modes) => {
        const problem = textProblem(text);
        if (problem) return fail(`Text: ${problem}`);
        if (descriptionTooLong(text, ENTITY_LIMITS.descriptionBytes)) return fail("Text: this is too long to save.");
        return writeEntry(draft, modes, key, added, entry => ({ ...entry, description: text.trim() }));
      },
    },
  };
};
