import {
  ITEM_CATEGORIES,
  ITEM_LIMITS,
  ITEM_RARITIES,
  ITEM_WEAPON_CATEGORIES,
  OPTIONAL_ITEM_ATTUNEMENT,
  itemAliasKey,
  validateItemInput,
  type ItemCategory,
  type ItemKind,
  type ItemRarity,
  type ItemWeaponCategory,
} from "shared/domain/dnd5e/item.js";
import type { SpellRef } from "shared/domain/dnd5e/spell.js";
import { fail, type FieldParse, type FieldSpec, type TokenListSpec } from "../../../sheetEditor/fieldSpec.js";
import { capitalize } from "../../itemFormat.js";
import { MASTERY_PRESETS, PROPERTY_PRESETS, RECHARGE_OPTIONS, draftToInput, type ItemDraft } from "./itemDraft.js";

// The item sheet's fields, each defined once: the live presentation draws them as inputs on the
// sheet, the targets presentation inside its popover editors. A field's id is its issue target id.

/** Items keep no modes beside their draft. */
export type ItemModes = Record<string, never>;
export type ItemField = FieldSpec<ItemDraft, ItemModes>;
export type ItemTokens = TokenListSpec<ItemDraft, ItemModes>;

/**
 * The patch, unless the shared validator objects to the field at `path` once it is applied. The
 * rules and messages are `validateItemInput`'s; a problem elsewhere in the draft does not block it.
 */
const checked = (draft: ItemDraft, patch: Partial<ItemDraft>, path: string): FieldParse<ItemDraft, ItemModes> => {
  const result = validateItemInput(draftToInput({ ...draft, ...patch }));
  const issue = result.ok ? undefined : result.issues.find(candidate => candidate.path === path);
  return issue ? fail(issue.message) : { ok: true, patch };
};

type TextKey = { [Key in keyof ItemDraft]-?: ItemDraft[Key] extends string ? Key : never }[keyof ItemDraft];

/** A field stored as the draft's text (trimmed), checked at its validator path. */
const textField = (id: string, label: string, key: TextKey, path: string, extra: Partial<ItemField> = {}): ItemField => ({
  id,
  label,
  read: draft => draft[key],
  parse: (text, draft) => checked(draft, { [key]: text.trim() }, path),
  ...extra,
});

export const NAME_FIELD = textField("name", "Name", "name", "name");
export const SOURCE_FIELD = textField("source", "Source", "source", "source");
export const PAGE_FIELD = textField("page", "Page", "page", "page", { placeholder: "+ page", inputMode: "numeric" });

/** A generated or grouped item says what it is first; its category is then optional. */
export const categoryField = (kind: ItemKind): ItemField => ({
  id: "category",
  label: "Category",
  options: [
    { value: "", label: kind === "concrete" ? "Item" : "no category" },
    ...ITEM_CATEGORIES.map(category => ({ value: category, label: capitalize(category) })),
  ],
  read: draft => draft.category,
  parse: (text, draft) => checked(draft, { category: text as ItemCategory | "" }, "category"),
});

const RARITY_LABELS: Partial<Record<ItemRarity, string>> = { none: "no rarity", unknown: "unknown rarity" };

export const RARITY_FIELD: ItemField = {
  id: "rarity",
  label: "Rarity",
  options: ITEM_RARITIES.map(rarity => ({ value: rarity, label: RARITY_LABELS[rarity] ?? rarity })),
  read: draft => draft.rarity,
  parse: (text, draft) => checked(draft, { rarity: text as ItemRarity }, "rarity"),
};

const isOptional = (note: string) => note.trim().toLowerCase() === OPTIONAL_ITEM_ATTUNEMENT.toLowerCase();

/** None, required (with an optional note such as "by a wizard"), or optional attunement. */
export const ATTUNEMENT_FIELD: ItemField = {
  id: "attunement",
  label: "Attunement",
  options: [
    { value: "none", label: "no attunement" },
    { value: "required", label: "requires attunement" },
    { value: "optional", label: "optional attunement" },
  ],
  read: draft => (draft.requiresAttunement ? "required" : isOptional(draft.attunementNote) ? "optional" : "none"),
  parse: (text, draft) => {
    const patch: Partial<ItemDraft> = text === "required"
      ? { requiresAttunement: true, attunementNote: isOptional(draft.attunementNote) ? "" : draft.attunementNote }
      : { requiresAttunement: false, attunementNote: text === "optional" ? OPTIONAL_ITEM_ATTUNEMENT : "" };
    return checked(draft, patch, "attunementNote");
  },
};

export const ATTUNEMENT_NOTE_FIELD = textField("attunementNote", "Attunement note", "attunementNote", "attunementNote", { placeholder: "+ note" });

export const VALUE_FIELD = textField("valueCp", "Value (gp)", "valueGp", "valueCp", { placeholder: "+ value" });
export const WEIGHT_FIELD = textField("weightLb", "Weight (lb.)", "weightLb", "weightLb", { placeholder: "+ weight" });
export const DAMAGE_DICE_FIELD = textField("damageDice", "Damage dice", "damageDice", "details.damage.dice", { placeholder: "+ dice" });
export const DAMAGE_TYPE_FIELD = textField("damageType", "Damage type", "damageType", "details.damage.type", { placeholder: "+ type" });
export const VERSATILE_FIELD = textField("versatileDice", "Versatile damage", "versatileDice", "details.damage.versatileDice", { placeholder: "+ versatile" });
export const WEAPON_CATEGORY_FIELD: ItemField = {
  id: "weaponCategory",
  label: "Weapon category",
  options: ITEM_WEAPON_CATEGORIES.map(category => ({ value: category, label: capitalize(category) })),
  read: draft => draft.weaponCategory,
  parse: (text, draft) => checked(draft, { weaponCategory: text as ItemWeaponCategory | "" }, "details.weaponCategory"),
};
export const RANGE_FIELD = textField("range", "Range (ft.)", "range", "details.range", { placeholder: "+ range" });
export const ARMOR_CLASS_FIELD = textField("armorClass", "Armor class", "armorClass", "details.armorClass", { placeholder: "+ AC", inputMode: "numeric" });
export const STRENGTH_FIELD = textField("strength", "Strength requirement", "strength", "details.strength", { placeholder: "+ score", inputMode: "numeric" });
export const BONUS_WEAPON_FIELD = textField("bonusWeapon", "Weapon bonus", "bonusWeapon", "details.bonusWeapon", { placeholder: "+ bonus" });
export const BONUS_AC_FIELD = textField("bonusAc", "AC bonus", "bonusAc", "details.bonusAc", { placeholder: "+ bonus" });
export const CHARGES_FIELD = textField("charges", "Charges", "charges", "details.charges", { placeholder: "+ charges" });
export const RECHARGE_AMOUNT_FIELD = textField("rechargeAmount", "Recharge amount", "rechargeAmount", "details.rechargeAmount", { placeholder: "+ amount" });
/** When charges return; blank keeps the amount without a time, as the old form's "None" did. */
export const RECHARGE_FIELD: ItemField = {
  id: "recharge",
  label: "Recharge",
  options: [{ value: "", label: "no set time" }, ...RECHARGE_OPTIONS],
  read: draft => draft.recharge,
  parse: (text, draft) => checked(draft, { recharge: text }, "details.recharge"),
};

/** The description's source (tags as written); kept as typed, trimmed on save. */
export const DESCRIPTION_FIELD: ItemField = {
  id: "description",
  label: "Description",
  read: draft => draft.description,
  parse: (text, draft) => checked(draft, { description: text }, "details.description"),
};

/**
 * The spell list with `spell` added at its end, unless the shared validator objects to the list or
 * to that spell's name or source (`details.spells`, `details.spells.N.*`).
 */
export const spellAddition = (draft: ItemDraft, spell: SpellRef): FieldParse<ItemDraft, ItemModes> => {
  const spells = [...(draft.spells ?? []), spell];
  const at = `details.spells.${spells.length - 1}`;
  const result = validateItemInput(draftToInput({ ...draft, spells }));
  const issue = result.ok ? undefined : result.issues.find(candidate =>
    candidate.path === "details.spells" || candidate.path === at || candidate.path.startsWith(`${at}.`));
  return issue ? fail(issue.message) : { ok: true, patch: { spells } };
};

const tooLong = (label: string, max: number) => (token: string) =>
  token.length > max ? `${label} can be at most ${max} characters each.` : undefined;

/** The line's tokens, unless there are more than the validator allows. */
const writeList = (label: string, max: number, write: (tokens: string[], draft: ItemDraft) => Partial<ItemDraft>) =>
  (tokens: string[], draft: ItemDraft): FieldParse<ItemDraft, ItemModes> =>
    tokens.length > max ? fail(`${label} can hold at most ${max} entries.`) : { ok: true, patch: write(tokens, draft) };

export const ALIASES: ItemTokens = {
  id: "aliases",
  label: "Aliases",
  noun: "alias",
  read: draft => draft.aliases,
  check: tooLong("Aliases", ITEM_LIMITS.alias),
  key: token => itemAliasKey(token),
  write: writeList("Aliases", ITEM_LIMITS.aliases, tokens => ({ aliases: tokens })),
};

/** Properties or mastery: an emptied list that was never set stays absent, as stored. */
const detailList = (key: "properties" | "mastery", label: string, noun: string, presets: readonly string[]): ItemTokens => ({
  id: key,
  label,
  noun,
  read: draft => draft[key] ?? [],
  check: tooLong(label, ITEM_LIMITS.shortText),
  write: writeList(label, ITEM_LIMITS.list, (tokens, draft) => ({
    [key]: tokens.length === 0 && !draft[key]?.length ? draft[key] : tokens,
  })),
  suggestions: presets.map(value => ({ value, label: value })),
});

export const PROPERTIES = detailList("properties", "Properties", "property", PROPERTY_PRESETS);
export const MASTERY = detailList("mastery", "Mastery", "mastery", MASTERY_PRESETS);

/**
 * A line of the stats list. It is shown while `present`; "+ stat" offers the others (every stat,
 * whatever the category, as the old form did). `clear` is its Remove; `add` sets a stat that has no
 * text to type (a flag) when it is chosen.
 */
export type ItemStat = {
  /** The target that edits the line, and the key "+ stat" adds it by. */
  key: string;
  label: string;
  present: (draft: ItemDraft) => boolean;
  clear: (draft: ItemDraft) => Partial<ItemDraft>;
  specs: readonly ItemField[];
  tokens?: ItemTokens;
  add?: Partial<ItemDraft>;
};

const textStat = (key: string, label: string, spec: ItemField, draftKey: TextKey): ItemStat => ({
  key,
  label,
  present: draft => draft[draftKey] !== "",
  clear: () => ({ [draftKey]: "" }),
  specs: [spec],
});

export const ITEM_STATS: readonly ItemStat[] = [
  textStat("valueCp", "Value", VALUE_FIELD, "valueGp"),
  textStat("weightLb", "Weight", WEIGHT_FIELD, "weightLb"),
  {
    key: "damage",
    label: "Damage",
    present: draft => draft.damageDice !== "" || draft.damageType !== "" || draft.versatileDice !== "",
    clear: () => ({ damageDice: "", damageType: "", versatileDice: "" }),
    specs: [DAMAGE_DICE_FIELD, DAMAGE_TYPE_FIELD, VERSATILE_FIELD],
  },
  textStat("weaponCategory", "Weapon", WEAPON_CATEGORY_FIELD, "weaponCategory"),
  textStat("range", "Range", RANGE_FIELD, "range"),
  textStat("armorClass", "Armor Class", ARMOR_CLASS_FIELD, "armorClass"),
  textStat("strength", "Strength", STRENGTH_FIELD, "strength"),
  {
    key: "stealth",
    label: "Stealth",
    present: draft => draft.stealthDisadvantage === true,
    clear: () => ({ stealthDisadvantage: false }),
    specs: [],
    add: { stealthDisadvantage: true },
  },
  textStat("bonusWeapon", "Attack and damage", BONUS_WEAPON_FIELD, "bonusWeapon"),
  textStat("bonusAc", "AC bonus", BONUS_AC_FIELD, "bonusAc"),
  textStat("charges", "Charges", CHARGES_FIELD, "charges"),
  {
    key: "recharge",
    label: "Recharge",
    present: draft => draft.recharge !== "" || draft.rechargeAmount !== "",
    clear: () => ({ recharge: "", rechargeAmount: "" }),
    specs: [RECHARGE_AMOUNT_FIELD, RECHARGE_FIELD],
  },
  {
    key: "properties",
    label: "Properties",
    present: draft => (draft.properties?.length ?? 0) > 0,
    clear: draft => ({ properties: draft.properties && [] }),
    specs: [],
    tokens: PROPERTIES,
  },
  {
    key: "mastery",
    label: "Mastery",
    present: draft => (draft.mastery?.length ?? 0) > 0,
    clear: draft => ({ mastery: draft.mastery && [] }),
    specs: [],
    tokens: MASTERY,
  },
];

export const statByKey = (key: string): ItemStat | undefined => ITEM_STATS.find(stat => stat.key === key);
