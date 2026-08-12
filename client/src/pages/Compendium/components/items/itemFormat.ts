import { ITEM_LIMITS, OPTIONAL_ITEM_ATTUNEMENT, type ItemKind, type ItemLink, type ItemSummary } from "shared/domain/dnd5e/item.js";

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const KIND_LABELS: Record<ItemKind, string> = { concrete: "Item", family: "Magic variant", group: "Group" };

/** Gold has two more decimal places than the stored copper value. */
export const itemValueInGold = (valueCp: number) =>
  (valueCp / 100).toFixed(ITEM_LIMITS.decimals + 2).replace(/\.?0+$/, "");

/** 1500 cp → "15 gp", 50 → "5 sp", 0.5 → "0.5 cp". */
export function formatItemValue(valueCp: number): string {
  const trim = (value: number) => String(Number(value.toFixed(4)));
  if (valueCp >= 100) return `${itemValueInGold(valueCp)} gp`;
  if (valueCp >= 10 && valueCp % 10 === 0) return `${trim(valueCp / 10)} sp`;
  return `${trim(valueCp)} cp`;
}

export const formatItemWeight = (weightLb: number) => `${Number(weightLb.toFixed(4))} lb.`;

export const formatItemLink = (link: ItemLink) => `${link.name} (${link.source})`;

/** "Requires attunement by a wizard", "Optional attunement", or nothing. */
export function formatAttunement(item: Pick<ItemSummary, "requiresAttunement" | "attunementNote">): string | null {
  if (item.requiresAttunement) return item.attunementNote ? `Requires attunement ${item.attunementNote}` : "Requires attunement";
  if (item.attunementNote === OPTIONAL_ITEM_ATTUNEMENT) return "Optional attunement";
  return null;
}

/** "Wondrous item, rare" for the card's subtitle. Groups and families say what they are. */
export function formatItemType(item: Pick<ItemSummary, "kind" | "category" | "rarity">): string {
  const type = item.kind === "concrete" ? capitalize(item.category ?? "item") : KIND_LABELS[item.kind];
  return item.rarity === "none" || item.rarity === "unknown" ? type : `${type}, ${item.rarity}`;
}
