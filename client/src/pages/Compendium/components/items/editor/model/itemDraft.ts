import {
  HOMEBREW_ITEM_SOURCE,
  ITEM_LIMITS,
  type Item,
  type ItemCategory,
  type ItemDetails,
  type ItemInput,
  type ItemLink,
  type ItemRarity,
  type ItemWeaponCategory,
} from "shared/domain/dnd5e/item.js";
import type { SpellRef } from "shared/domain/dnd5e/spell.js";
import { itemValueInGold } from "../../itemFormat.js";

// The item sheet's draft: text for every value, converted to an ItemInput on save. Every normalized
// detail has a field, so a full-snapshot save keeps what it does not change.
export interface ItemDraft {
  name: string;
  source: string;
  page: string;
  category: ItemCategory | "";
  rarity: ItemRarity;
  requiresAttunement: boolean;
  attunementNote: string;
  valueGp: string;
  weightLb: string;
  aliases: string[];
  /** The base printing; a generated specific's base cannot change and is never sent. */
  base: ItemLink | null;
  baseLocked: boolean;
  description: string;
  wondrous?: boolean;
  weaponCategory: ItemWeaponCategory | "";
  damageDice: string;
  damageType: string;
  versatileDice: string;
  range: string;
  properties?: string[];
  mastery?: string[];
  armorClass: string;
  strength: string;
  stealthDisadvantage?: boolean;
  bonusWeapon: string;
  bonusAc: string;
  charges: string;
  recharge: string;
  rechargeAmount: string;
  spells?: SpellRef[];
}

export const blankItemDraft = (): ItemDraft => ({
  name: "",
  source: HOMEBREW_ITEM_SOURCE,
  page: "",
  category: "wondrous item",
  rarity: "uncommon",
  requiresAttunement: false,
  attunementNote: "",
  valueGp: "",
  weightLb: "",
  aliases: [],
  base: null,
  baseLocked: false,
  description: "",
  weaponCategory: "",
  damageDice: "",
  damageType: "",
  versatileDice: "",
  range: "",
  armorClass: "",
  strength: "",
  bonusWeapon: "",
  bonusAc: "",
  charges: "",
  recharge: "",
  rechargeAmount: "",
});

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

/**
 * "Duplicate as homebrew" keeps the definition (and a base link) but not the source, page or
 * generation link: the copy is a standalone homebrew item.
 */
export function itemToDraft(item: Item, options: { duplicate?: boolean } = {}): ItemDraft {
  const { details } = item;
  const duplicate = options.duplicate ?? false;
  return {
    name: item.name,
    source: duplicate ? HOMEBREW_ITEM_SOURCE : item.source,
    page: duplicate ? "" : numberText(item.page),
    category: item.category ?? "",
    rarity: item.rarity,
    requiresAttunement: item.requiresAttunement,
    attunementNote: item.attunementNote ?? "",
    valueGp: item.valueCp === undefined ? "" : itemValueInGold(item.valueCp),
    weightLb: numberText(item.weightLb),
    aliases: item.aliases,
    base: item.base ?? null,
    baseLocked: !duplicate && item.family !== undefined,
    description: details.description ?? "",
    wondrous: details.wondrous,
    weaponCategory: details.weaponCategory ?? "",
    damageDice: details.damage?.dice ?? "",
    damageType: details.damage?.type ?? "",
    versatileDice: details.damage?.versatileDice ?? "",
    range: details.range ?? "",
    properties: details.properties,
    mastery: details.mastery,
    armorClass: numberText(details.armorClass),
    strength: numberText(details.strength),
    stealthDisadvantage: details.stealthDisadvantage,
    bonusWeapon: details.bonusWeapon ?? "",
    bonusAc: details.bonusAc ?? "",
    charges: details.charges === undefined ? "" : String(details.charges),
    recharge: details.recharge ?? "",
    rechargeAmount: details.rechargeAmount ?? "",
    spells: details.spells,
  };
}

const text = (value: string) => (value.trim() ? value.trim() : undefined);
// Numbers that do not parse pass through as NaN, so validateItemInput reports them.
const number = (value: string) => (value.trim() === "" ? undefined : Number(value));

// Move the decimal point in the text before converting to Number. The supported cp range
// has fewer than 16 significant digits, so each value round-trips at the column's scale.
export function goldToCopper(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /^\+?(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (!match[1] && !match[2])) return NaN;
  const scale = ITEM_LIMITS.decimals + 2;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > scale) return NaN;
  const digits = fraction.padEnd(scale, "0");
  return Number(`${match[1]}${digits.slice(0, 2)}.${digits.slice(2)}`);
}

export function draftToInput(draft: ItemDraft, originalCharges?: ItemDetails["charges"]): ItemInput {
  const dice = draft.damageDice.trim();
  const type = text(draft.damageType);
  const versatileDice = text(draft.versatileDice);
  const charges = draft.charges.trim();
  const unchangedCharges = originalCharges !== undefined && charges === String(originalCharges);
  const details: ItemDetails = {
    description: text(draft.description),
    wondrous: draft.wondrous,
    weaponCategory: draft.weaponCategory || undefined,
    damage: dice || type || versatileDice ? { dice, type, versatileDice } : undefined,
    range: text(draft.range),
    properties: draft.properties,
    mastery: draft.mastery,
    armorClass: number(draft.armorClass),
    strength: number(draft.strength),
    stealthDisadvantage: draft.stealthDisadvantage,
    bonusWeapon: text(draft.bonusWeapon),
    bonusAc: text(draft.bonusAc),
    charges: unchangedCharges ? originalCharges
      : charges === "" ? undefined
        : /^\d+$/.test(charges) ? Number(charges) : charges,
    recharge: text(draft.recharge),
    rechargeAmount: text(draft.rechargeAmount),
    spells: draft.spells,
  };
  return {
    name: draft.name.trim(),
    source: draft.source.trim(),
    page: number(draft.page),
    category: draft.category || undefined,
    rarity: draft.rarity,
    requiresAttunement: draft.requiresAttunement,
    attunementNote: text(draft.attunementNote),
    valueCp: goldToCopper(draft.valueGp),
    weightLb: number(draft.weightLb),
    aliases: draft.aliases,
    baseItemId: draft.baseLocked ? undefined : draft.base?.id,
    details,
  };
}

/** When charges come back, labelled as the sheet reads ("1d6 + 4 at dawn"). */
export const RECHARGE_OPTIONS = [
  { value: "dawn", label: "at dawn" },
  { value: "dusk", label: "at dusk" },
  { value: "midnight", label: "at midnight" },
  { value: "restShort", label: "after a short rest" },
  { value: "restLong", label: "after a long rest" },
];

export const PROPERTY_PRESETS = [
  "Ammunition", "Finesse", "Heavy", "Light", "Loading", "Reach", "Thrown", "Two-Handed", "Versatile",
];

export const MASTERY_PRESETS = ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"];
