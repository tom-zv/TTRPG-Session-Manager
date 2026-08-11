import type {
  Item,
  ItemDetails,
  ItemInput,
  ItemSummary,
  StoredItemDetails,
} from "shared/domain/dnd5e/item.js";
import type { ItemDB, ItemSummaryDB, ItemViewer, ItemWriteDB } from "src/api/encounter/items/types.js";

// Responses are built field by field: stored details also hold the raw upstream record, which no
// viewer receives, and a row's GM state reaches GMs only.

const DETAIL_SCALARS = [
  "description", "wondrous", "weaponCategory", "range", "armorClass", "strength", "stealthDisadvantage",
  "bonusWeapon", "bonusAc", "charges", "recharge", "rechargeAmount",
] as const satisfies ReadonlyArray<keyof ItemDetails>;

/** The normalized, public part of stored item details. */
export function projectItemDetails(stored: StoredItemDetails): ItemDetails {
  const details: Record<string, unknown> = {};
  for (const key of DETAIL_SCALARS) {
    if (stored[key] !== undefined && stored[key] !== null) details[key] = stored[key];
  }
  if (stored.damage) {
    const { dice, type, versatileDice } = stored.damage;
    details.damage = { dice, ...(type ? { type } : {}), ...(versatileDice ? { versatileDice } : {}) };
  }
  if (stored.properties) details.properties = [...stored.properties];
  if (stored.mastery) details.mastery = [...stored.mastery];
  if (stored.spells) details.spells = stored.spells.map(({ name, source }) => (source ? { name, source } : { name }));
  return details as ItemDetails;
}

function summaryFields(row: ItemSummaryDB): Omit<ItemSummary, "gm"> {
  return {
    id: row.id,
    kind: row.kind,
    origin: row.import_key === null ? "homebrew" : "imported",
    name: row.name,
    source: row.source,
    ...(row.category !== null ? { category: row.category } : {}),
    rarity: row.rarity,
    requiresAttunement: row.requires_attunement,
    ...(row.attunement_note !== null ? { attunementNote: row.attunement_note } : {}),
    ...(row.value_cp !== null ? { valueCp: row.value_cp } : {}),
    ...(row.weight_lb !== null ? { weightLb: row.weight_lb } : {}),
    aliases: row.aliases,
    // The model returns a specific only when its family is visible to the viewer.
    ...(row.family_id !== null && row.family_name !== null && row.family_source !== null
      ? { family: { id: row.family_id, name: row.family_name, source: row.family_source } }
      : {}),
    ...(row.base_item_id !== null && row.base_name !== null && row.base_source !== null
      ? { base: { id: row.base_item_id, name: row.base_name, source: row.base_source } }
      : {}),
  };
}

export function itemDbToSummary(row: ItemSummaryDB, viewer: ItemViewer): ItemSummary {
  return {
    ...summaryFields(row),
    ...(viewer.isGm ? { gm: { hidden: row.is_hidden, hiddenByFamily: row.family_hidden } } : {}),
  };
}

export function itemDbToDomain(row: ItemDB, viewer: ItemViewer): Item {
  return {
    ...summaryFields(row),
    ...(row.page !== null ? { page: row.page } : {}),
    details: projectItemDetails(row.details),
    ...(viewer.isGm
      ? {
          gm: {
            hidden: row.is_hidden,
            hiddenByFamily: row.family_hidden,
            locallyEdited: row.locally_edited,
            ...(row.import_key !== null ? { importKey: row.import_key } : {}),
            ...(row.import_revision !== null ? { importRevision: row.import_revision } : {}),
          },
        }
      : {}),
  };
}

/** The GM form's view of a stored item, for telling whether a submitted edit changes anything. */
export function itemDbToInput(row: ItemDB): ItemInput {
  return {
    name: row.name,
    source: row.source,
    ...(row.page !== null ? { page: row.page } : {}),
    ...(row.category !== null ? { category: row.category } : {}),
    rarity: row.rarity,
    requiresAttunement: row.requires_attunement,
    ...(row.attunement_note !== null ? { attunementNote: row.attunement_note } : {}),
    ...(row.value_cp !== null ? { valueCp: row.value_cp } : {}),
    ...(row.weight_lb !== null ? { weightLb: row.weight_lb } : {}),
    aliases: row.aliases,
    ...(row.base_item_id !== null && row.base_name !== null ? { baseItemId: row.base_item_id } : {}),
    details: projectItemDetails(row.details),
  };
}

// DECIMAL(15,4)/(12,4): send exact 4-place text so MySQL never sees a binary float.
const exactDecimal = (value: number | undefined) => (value === undefined ? null : value.toFixed(4));

/**
 * A validated ItemInput (shared validateItemInput) as the columns the API writes. `upstream` is the
 * stored source record of an imported item, which an edit keeps.
 */
export function itemInputToDb(input: ItemInput, upstream?: StoredItemDetails["upstream"]): ItemWriteDB {
  return {
    name: input.name,
    source: input.source,
    page: input.page ?? null,
    category: input.category ?? null,
    rarity: input.rarity,
    requires_attunement: input.requiresAttunement,
    attunement_note: input.attunementNote ?? null,
    value_cp: exactDecimal(input.valueCp),
    weight_lb: exactDecimal(input.weightLb),
    details: upstream ? { ...input.details, upstream } : { ...input.details },
    base_item_id: input.baseItemId ?? null,
  };
}
