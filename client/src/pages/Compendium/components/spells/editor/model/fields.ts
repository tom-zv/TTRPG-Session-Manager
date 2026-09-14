import { SPELL_LIMITS, SPELL_SCHOOLS, validateSpellInput, type SpellAttackKind, type SpellSchool } from "shared/domain/dnd5e/spell.js";
import { fail, type FieldOption, type FieldParse, type FieldSpec, type TokenListSpec } from "../../../sheetEditor/fieldSpec.js";
import { capitalize } from "../../spellFilters.js";
import {
  CASTING_TIME_PRESETS,
  CLASS_PRESETS,
  CONDITION_PRESETS,
  DAMAGE_TYPE_PRESETS,
  DURATION_PRESETS,
  RANGE_PRESETS,
  SAVE_PRESETS,
  draftToInput,
  type SpellDraft,
} from "./spellDraft.js";

// The spell sheet's fields, each defined once: the live presentation draws them as inputs on the
// sheet, the targets presentation inside its popover editors. A field's id is its issue target id.

/** Spells keep no modes beside their draft. */
export type SpellModes = Record<string, never>;
export type SpellField = FieldSpec<SpellDraft, SpellModes>;
export type SpellTokens = TokenListSpec<SpellDraft, SpellModes>;

/**
 * The patch, unless the shared validator objects to the field at `path` once it is applied. The
 * rules and messages are `validateSpellInput`'s; a problem elsewhere in the draft does not block it.
 */
const checked = (draft: SpellDraft, patch: Partial<SpellDraft>, path: string): FieldParse<SpellDraft, SpellModes> => {
  const result = validateSpellInput(draftToInput({ ...draft, ...patch }));
  const issue = result.ok ? undefined : result.issues.find(candidate => candidate.path === path);
  return issue ? fail(issue.message) : { ok: true, patch };
};

type TextKey = { [Key in keyof SpellDraft]-?: SpellDraft[Key] extends string ? Key : never }[keyof SpellDraft];
type FlagKey = { [Key in keyof SpellDraft]-?: SpellDraft[Key] extends boolean ? Key : never }[keyof SpellDraft];

/** A field stored as the draft's text, checked at its validator path. */
const textField = (id: string, label: string, key: TextKey, path: string, extra: Partial<SpellField> = {}): SpellField => ({
  id,
  label,
  read: draft => draft[key],
  parse: (text, draft) => checked(draft, { [key]: text.trim() }, path),
  ...extra,
});

const presets = (values: readonly string[]): FieldOption[] => values.map(value => ({ value, label: value }));

/** A yes/no flag as a choice; the live sheet draws some as a toggle instead. */
const flagField = (id: string, label: string, key: FlagKey, path: string, yes: string, no: string): SpellField => ({
  id,
  label,
  options: [{ value: "no", label: no }, { value: "yes", label: yes }],
  read: draft => (draft[key] ? "yes" : "no"),
  parse: (text, draft) => checked(draft, { [key]: text === "yes" }, path),
});

export const NAME_FIELD = textField("name", "Name", "name", "name");
export const SOURCE_FIELD = textField("source", "Source", "source", "source");
export const PAGE_FIELD = textField("page", "Page", "page", "page", { placeholder: "+ page", inputMode: "numeric" });

/** The level, in the sheet's words ("Cantrip", "Level 3"). */
export const LEVEL_FIELD: SpellField = {
  id: "level",
  label: "Level",
  options: [{ value: "0", label: "Cantrip" }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => ({ value: String(level), label: `Level ${level}` }))],
  read: draft => draft.level,
  parse: (text, draft) => checked(draft, { level: text }, "level"),
};

export const SCHOOL_FIELD: SpellField = {
  id: "school",
  label: "School",
  options: SPELL_SCHOOLS.map(school => ({ value: school, label: capitalize(school) })),
  read: draft => draft.school,
  parse: (text, draft) => checked(draft, { school: text as SpellSchool }, "school"),
};

export const RITUAL_FIELD = flagField("ritual", "Ritual", "ritual", "ritual", "ritual", "not ritual");

export const CASTING_TIME_FIELD = textField("castingTime", "Casting time", "castingTime", "castingTime", { suggestions: presets(CASTING_TIME_PRESETS) });
export const TRIGGER_FIELD = textField("castingTrigger", "Trigger", "castingTrigger", "castingTrigger", { placeholder: "+ trigger" });
export const RANGE_FIELD = textField("range", "Range", "range", "range", { suggestions: presets(RANGE_PRESETS) });
/** "Concentration, up to …" makes a concentration spell when it is saved. */
export const DURATION_FIELD = textField("duration", "Duration", "duration", "duration", { suggestions: presets(DURATION_PRESETS) });

export const VERBAL_FIELD = flagField("v", "Verbal component", "v", "components", "yes", "no");
export const SOMATIC_FIELD = flagField("s", "Somatic component", "s", "components", "yes", "no");
export const MATERIAL_COMPONENT_FIELD = flagField("m", "Material component", "m", "components", "yes", "no");
export const COMPONENT_FIELDS = [VERBAL_FIELD, SOMATIC_FIELD, MATERIAL_COMPONENT_FIELD] as const;
/** The letter the sheet shows for each component. */
export const COMPONENT_LETTERS: Record<string, string> = { v: "V", s: "S", m: "M" };

export const MATERIAL_FIELD = textField("material", "Material", "material", "material", { placeholder: "+ material" });
export const MATERIAL_COST_FIELD = textField("materialCostCp", "Material cost (gp)", "materialCostGp", "materialCostCp", { placeholder: "+ cost" });
export const MATERIAL_CONSUMED_FIELD = flagField("materialConsumed", "Material consumed", "materialConsumed", "materialConsumed", "consumed", "not consumed");

/** Rich text sources (tags as written); kept as typed, trimmed on save. */
export const DESCRIPTION_FIELD: SpellField = {
  id: "description",
  label: "Description",
  read: draft => draft.description,
  parse: (text, draft) => checked(draft, { description: text }, "description"),
};

export const HIGHER_LEVELS_FIELD: SpellField = {
  id: "higherLevels",
  label: "Higher levels",
  read: draft => draft.higherLevels,
  parse: (text, draft) => checked(draft, { higherLevels: text }, "higherLevels"),
};

export const ATTACK_FIELD: SpellField = {
  id: "attack",
  label: "Spell attack",
  options: [{ value: "", label: "none" }, { value: "melee", label: "melee" }, { value: "ranged", label: "ranged" }],
  read: draft => draft.attack,
  parse: (text, draft) => checked(draft, { attack: text as SpellAttackKind | "" }, "attack"),
};

type ListKey = "classes" | "damageTypes" | "saves" | "conditions" | "aliases";

/**
 * A spell's tag list. Damage types, saves and conditions are stored lowercase, so they are typed
 * that way too; their suggestions show capitalized, as the sheet reads them.
 */
const tagList = (key: ListKey, label: string, noun: string, values: readonly string[] = [], lowercase = false): SpellTokens => ({
  id: key,
  label,
  noun,
  read: draft => draft[key],
  check: token => (token.length > SPELL_LIMITS.tag ? `${label} can be at most ${SPELL_LIMITS.tag} characters each.` : undefined),
  ...(lowercase ? { normalize: (token: string) => token.toLowerCase() } : {}),
  write: tokens => ({ ok: true, patch: { [key]: tokens } }),
  ...(values.length > 0 ? { suggestions: values.map(value => ({ value, label: capitalize(value) })) } : {}),
});

export const CLASSES = tagList("classes", "Classes", "class", CLASS_PRESETS);
export const DAMAGE_TYPES = tagList("damageTypes", "Damage types", "damage type", DAMAGE_TYPE_PRESETS, true);
export const SAVES = tagList("saves", "Saving throws", "save", SAVE_PRESETS, true);
export const CONDITIONS = tagList("conditions", "Conditions", "condition", CONDITION_PRESETS, true);
export const ALIASES = tagList("aliases", "Also called", "alias");

/** The token lists below the text, in the order the sheet draws them. */
export const SPELL_TAG_LISTS: readonly SpellTokens[] = [CLASSES, DAMAGE_TYPES, SAVES, CONDITIONS, ALIASES];
