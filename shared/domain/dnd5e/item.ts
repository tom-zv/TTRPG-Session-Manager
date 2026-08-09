import type { SpellRef } from "./spell.js";

// D&D 5e item catalog (dnd5e.items). Catalog items are references for the table: they never change
// a character's or an encounter's statistics.

/** Catalog roles shared by imported and locally authored items. */
export const ITEM_KINDS = ["concrete", "family", "group"] as const;
export type ItemKind = typeof ITEM_KINDS[number];
export type ItemOrigin = "imported" | "homebrew";

export const ITEM_CATEGORIES = [
  "melee weapon", "ranged weapon", "ammunition", "light armor", "medium armor", "heavy armor",
  "shield", "gear", "tool", "mount", "vehicle", "potion", "scroll", "ring", "rod", "staff",
  "wand", "wondrous item", "treasure", "other",
] as const;
export type ItemCategory = typeof ITEM_CATEGORIES[number];

export const ITEM_RARITIES = [
  "none",
  "common",
  "uncommon",
  "rare",
  "very rare",
  "legendary",
  "artifact",
  "varies",
  "unknown",
  "unknown (magic)",
] as const;
export type ItemRarity = typeof ITEM_RARITIES[number];

export const ITEM_WEAPON_CATEGORIES = ["simple", "martial"] as const;
export type ItemWeaponCategory = typeof ITEM_WEAPON_CATEGORIES[number];

/** Ordered relationships in dnd5e.item_relations. */
export const ITEM_RELATIONS = ["group_member", "pack_content"] as const;
export type ItemRelation = typeof ITEM_RELATIONS[number];

// Source of items made in the app.
export const HOMEBREW_ITEM_SOURCE = "homebrew";

// ─── Import identity ──────────────────────────────────────────────────────────

/** A mention of an item: a group member, a base item, or an inline {@item Name|SRC} tag. */
export interface ItemRef {
  name: string;
  source?: string;
}

/** The 5etools UID of a record: lower-case "name|source". */
export const itemUid = (name: string, source: string): string =>
  `${name.trim().toLowerCase()}|${source.trim().toLowerCase()}`;

/** What identifies an imported record across imports. A specific is its family applied to a base item. */
export type ItemImportIdentity =
  | { kind: "named" | "base" | "group" | "family"; uid: string }
  | { kind: "specific"; familyUid: string; baseUid: string };

/**
 * dnd5e.items.import_key: immutable once written, so a rename keeps the row and its id.
 * "named:dagger of venom|dmg", "specific:+1 weapon|dmg>longsword|phb".
 */
export function itemImportKey(identity: ItemImportIdentity): string {
  return identity.kind === "specific"
    ? `specific:${identity.familyUid}>${identity.baseUid}`
    : `${identity.kind}:${identity.uid}`;
}

// ─── Read shapes ──────────────────────────────────────────────────────────────

export interface ItemLink {
  id: number;
  name: string;
  source: string;
}

export interface ItemDamage {
  dice: string;               // '1d8', '2d6', '1'
  type?: string;              // damage type name: 'slashing'
  versatileDice?: string;     // two-handed damage: '1d10'
}

/**
 * Normalized details for display and authoring.
 */
export interface ItemDetails {
  description?: string;       // rich text, see shared/domain/dnd5e/richText.ts
  wondrous?: boolean;
  weaponCategory?: ItemWeaponCategory;
  damage?: ItemDamage;
  range?: string;             // normal/long in feet: '80/320'
  properties?: string[];      // property display names
  mastery?: string[];         // mastery display names
  armorClass?: number;
  strength?: number;          // heavy armor: Strength score required
  stealthDisadvantage?: boolean;
  bonusWeapon?: string;       // '+1'
  bonusAc?: string;
  charges?: number | string;  // fixed initial count or formula, e.g. 1d6 + 1
  recharge?: string;          // 'dawn', 'restLong'
  rechargeAmount?: string;    // '1d6 + 4'
  spells?: SpellRef[];        // spells the item lets its wielder cast, matched by name + source
}

/** JSON persisted in dnd5e.items.details. Project normalized fields for API responses. */
export interface StoredItemDetails extends ItemDetails {
  upstream?: Record<string, unknown>;
}

/** GM-only state; player responses never carry it. */
export interface ItemVisibility {
  hidden: boolean;            // the item's own flag
  hiddenByFamily: boolean;    // a generated specific whose family is hidden
}

export interface ItemGmState extends ItemVisibility {
  locallyEdited: boolean;
  importKey?: string;         // absent for homebrew
  importRevision?: string;
}

/** Index row: what the browser lists, sorts and filters by. */
export interface ItemSummary {
  id: number;
  kind: ItemKind;
  origin: ItemOrigin;
  name: string;
  source: string;
  category?: ItemCategory;
  rarity: ItemRarity;
  requiresAttunement: boolean;
  attunementNote?: string;    // 'by a wizard'
  valueCp?: number;
  weightLb?: number;
  aliases: string[];
  family?: ItemLink;          // specifics: the variant family
  base?: ItemLink;            // specifics: the base printing; named items: their base item
  gm?: ItemVisibility;
}

export interface Item extends Omit<ItemSummary, "gm"> {
  page?: number;
  details: ItemDetails;
  gm?: ItemGmState;
}

// ─── Index and resolution ─────────────────────────────────────────────────────

/** dnd5e.items.id is a signed INT. */
export const ITEM_ID_MAX = 2_147_483_647;

export const ITEM_LIST_LIMITS = { defaultLimit: 50, maxLimit: 100, query: 128 } as const;

/**
 * GET /api/dnd5e/items. Generated specifics are left out unless `specifics` is true or `q` is given,
 * so the default browse lists named items, base gear, groups and families.
 */
export interface ItemListParams {
  q?: string;                 // name or alias contains, case-insensitive
  kinds?: ItemKind[];
  categories?: ItemCategory[];
  origins?: ItemOrigin[];
  rarities?: ItemRarity[];
  sources?: string[];
  attunement?: boolean;
  specifics?: boolean;
  offset?: number;
  limit?: number;
}

/** Filter choices among the items this viewer can see. */
export interface ItemFacets {
  kinds: ItemKind[];
  categories: ItemCategory[];
  origins: ItemOrigin[];
  rarities: ItemRarity[];
  sources: string[];
}

export interface ItemListResult {
  items: ItemSummary[];
  total: number;
  offset: number;
  limit: number;
  facets: ItemFacets;
}

export const ITEM_RESOLVE_LIMIT = 100;

/** POST /api/dnd5e/items/resolve. */
export interface ItemResolveRequest {
  refs: ItemRef[];
}

/** One result per requested ref, in request order. Hidden, deleted and missing items are all `null`. */
export interface ItemResolveResult {
  results: { ref: ItemRef; item: ItemSummary | null }[];
}

// ─── GM input ─────────────────────────────────────────────────────────────────

/**
 * What POST and PUT /api/dnd5e/items accept: the form's full snapshot. Kind and import identity are
 * not input; a created item is concrete homebrew and an edited item keeps its role and identity.
 */
export interface ItemInput {
  name: string;
  source: string;
  page?: number;
  category?: ItemCategory;
  rarity: ItemRarity;
  requiresAttunement: boolean;
  attunementNote?: string;
  valueCp?: number;
  weightLb?: number;
  aliases: string[];
  baseItemId?: number;
  details: ItemDetails;
}

/** Toggle an item's own hidden flag (GM). */
export interface ItemVisibilityInput {
  hidden: boolean;
}

// Field limits, matching dnd5e.items, item_aliases and the DECIMAL columns.
export const ITEM_LIMITS = {
  name: 255,
  source: 32,
  attunementNote: 255,
  alias: 255,
  aliases: 50,
  page: 65535,
  valueCp: 99_999_999_999.9999,
  weightLb: 99_999_999.9999,
  decimals: 4,
  description: 65535,
  shortText: 64,
  list: 50,
  armorClass: 99,
  strength: 30,
  charges: 9999,
} as const;

/** Canonical key stored with each alias for case-insensitive, accent-sensitive uniqueness. */
export const itemAliasKey = (alias: string): string => alias.trim().toLowerCase().normalize("NFC");

export type ItemValidation = { ok: true; value: ItemInput } | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAbsent = (value: unknown) => value === undefined || value === null || value === "";

/**
 * Validates a GM-authored item and returns it normalized: text trimmed, blank optional fields
 * dropped, and only known fields kept, so a client echoing `upstream` or other stored data cannot
 * write it. Otherwise lists every problem as a message for the user.
 */
export function validateItemInput(input: unknown): ItemValidation {
  if (!isRecord(input)) return { ok: false, errors: ["The item must be an object."] };
  const errors: string[] = [];

  const text = (source: Record<string, unknown>, key: string, label: string, max: number, required: boolean) => {
    const value = source[key];
    if (isAbsent(value)) {
      if (required) errors.push(`${label} is required.`);
      return undefined;
    }
    if (typeof value !== "string") {
      errors.push(`${label} must be text.`);
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) errors.push(`${label} is required.`);
      return undefined;
    }
    if (trimmed.length > max) errors.push(`${label} can be at most ${max} characters.`);
    return trimmed;
  };
  const whole = (source: Record<string, unknown>, key: string, label: string, min: number, max: number) => {
    const value = source[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${label} must be a whole number from ${min} to ${max}.`);
      return undefined;
    }
    return value;
  };
  const decimal = (key: string, label: string, max: number) => {
    const value = input[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max
      || Number(value.toFixed(ITEM_LIMITS.decimals)) !== value) {
      errors.push(`${label} must be a number from 0 to ${max} with at most ${ITEM_LIMITS.decimals} decimal places.`);
      return undefined;
    }
    return value;
  };
  const flag = (source: Record<string, unknown>, key: string, label: string, required: boolean) => {
    const value = source[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== "boolean") {
      errors.push(`${label} must be true or false.`);
      return undefined;
    }
    return value;
  };
  const names = (source: Record<string, unknown>, key: string, label: string, max: number, count: number, required: boolean) => {
    const value = source[key];
    if (value === undefined && !required) return undefined;
    if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
      errors.push(`${label} must be a list of names.`);
      return undefined;
    }
    const trimmed = (value as string[]).map(item => item.trim());
    if (trimmed.length > count) errors.push(`${label} can hold at most ${count} entries.`);
    if (trimmed.some(item => item.length > max)) errors.push(`${label} can be at most ${max} characters each.`);
    if (new Set(trimmed.map(itemAliasKey)).size !== trimmed.length) errors.push(`${label} must not repeat.`);
    return trimmed;
  };

  const name = text(input, "name", "Name", ITEM_LIMITS.name, true);
  const source = text(input, "source", "Source", ITEM_LIMITS.source, true);
  const page = whole(input, "page", "Page", 1, ITEM_LIMITS.page);
  const categoryInput = input.category;
  const category = (ITEM_CATEGORIES as readonly unknown[]).includes(categoryInput)
    ? categoryInput as ItemCategory
    : undefined;
  if (!isAbsent(categoryInput) && category === undefined) errors.push("Choose an item category.");
  const rarity = (ITEM_RARITIES as readonly unknown[]).includes(input.rarity) ? input.rarity as ItemRarity : undefined;
  if (!rarity) errors.push("Choose a rarity.");
  const requiresAttunement = flag(input, "requiresAttunement", "Requires attunement", true);
  const attunementNote = text(input, "attunementNote", "Attunement note", ITEM_LIMITS.attunementNote, false);
  if (attunementNote !== undefined && requiresAttunement === false) errors.push("An attunement note needs Requires attunement.");
  const valueCp = decimal("valueCp", "Value", ITEM_LIMITS.valueCp);
  const weightLb = decimal("weightLb", "Weight", ITEM_LIMITS.weightLb);
  const aliases = names(input, "aliases", "Aliases", ITEM_LIMITS.alias, ITEM_LIMITS.aliases, true);
  const baseItemId = whole(input, "baseItemId", "Base item", 1, ITEM_ID_MAX);

  const details: ItemDetails = {};
  const raw = input.details;
  if (!isRecord(raw)) {
    errors.push("Details must be an object.");
  } else {
    const short = (key: string, label: string) => text(raw, key, label, ITEM_LIMITS.shortText, false);
    details.description = text(raw, "description", "Description", ITEM_LIMITS.description, false);
    details.wondrous = flag(raw, "wondrous", "Wondrous", false);
    if (raw.weaponCategory !== undefined) {
      if ((ITEM_WEAPON_CATEGORIES as readonly unknown[]).includes(raw.weaponCategory)) {
        details.weaponCategory = raw.weaponCategory as ItemWeaponCategory;
      } else errors.push("Weapon category must be simple or martial.");
    }
    if (raw.damage !== undefined) {
      if (!isRecord(raw.damage)) errors.push("Damage must be an object.");
      else {
        const dice = text(raw.damage, "dice", "Damage dice", ITEM_LIMITS.shortText, true);
        const damageType = text(raw.damage, "type", "Damage type", ITEM_LIMITS.shortText, false);
        const versatileDice = text(raw.damage, "versatileDice", "Versatile damage", ITEM_LIMITS.shortText, false);
        if (dice) details.damage = dropUndefined({ dice, type: damageType, versatileDice });
      }
    }
    details.range = short("range", "Range");
    details.properties = names(raw, "properties", "Properties", ITEM_LIMITS.shortText, ITEM_LIMITS.list, false);
    details.mastery = names(raw, "mastery", "Mastery", ITEM_LIMITS.shortText, ITEM_LIMITS.list, false);
    details.armorClass = whole(raw, "armorClass", "Armor class", 0, ITEM_LIMITS.armorClass);
    details.strength = whole(raw, "strength", "Strength requirement", 1, ITEM_LIMITS.strength);
    details.stealthDisadvantage = flag(raw, "stealthDisadvantage", "Stealth disadvantage", false);
    details.bonusWeapon = short("bonusWeapon", "Weapon bonus");
    details.bonusAc = short("bonusAc", "AC bonus");
    details.charges = typeof raw.charges === "string"
      ? short("charges", "Charges formula")
      : whole(raw, "charges", "Charges", 0, ITEM_LIMITS.charges);
    details.recharge = short("recharge", "Recharge");
    details.rechargeAmount = short("rechargeAmount", "Recharge amount");
    if (raw.spells !== undefined) {
      if (!Array.isArray(raw.spells) || raw.spells.length > ITEM_LIMITS.list) {
        errors.push(`Spells must be a list of at most ${ITEM_LIMITS.list} spells.`);
      } else {
        details.spells = raw.spells.flatMap((spell: unknown, index) => {
          if (!isRecord(spell)) {
            errors.push(`Spell ${index + 1} must name a spell.`);
            return [];
          }
          const spellName = text(spell, "name", `Spell ${index + 1}`, ITEM_LIMITS.name, true);
          const spellSource = text(spell, "source", `Spell ${index + 1} source`, ITEM_LIMITS.source, false);
          return spellName ? [spellSource ? { name: spellName, source: spellSource } : { name: spellName }] : [];
        });
      }
    }
  }

  if (errors.length > 0 || !name || !source || !rarity || requiresAttunement === undefined || !aliases) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: dropUndefined({
      name, source, page, category, rarity, requiresAttunement, attunementNote, valueCp, weightLb, aliases, baseItemId,
      details: dropUndefined(details),
    }),
  };
}

function dropUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
