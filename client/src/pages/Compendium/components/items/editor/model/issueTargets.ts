import type { WriteIssue } from "shared/domain/writeValidation.js";
import { placeIssues as placeSheetIssues, type IssuePlacement, type PlacedIssue } from "../../../sheetEditor/issues.js";
import type { SheetPresentation } from "../../../sheetEditor/usePresentation.js";
import type { ItemDraft } from "./itemDraft.js";

// `validateItemInput`'s paths (step 03) mapped onto the item sheet: the live field that fixes each
// one, and the target whose editor shows that field.

/** Paths that name one field. */
const PATH_FIELDS: Record<string, string> = {
  name: "name",
  source: "source",
  page: "page",
  category: "category",
  rarity: "rarity",
  requiresAttunement: "attunement",
  attunementNote: "attunementNote",
  valueCp: "valueCp",
  weightLb: "weightLb",
  baseItemId: "base",
  "details.description": "description",
  "details.weaponCategory": "weaponCategory",
  "details.damage": "damageDice",
  "details.damage.dice": "damageDice",
  "details.damage.type": "damageType",
  "details.damage.versatileDice": "versatileDice",
  "details.range": "range",
  "details.armorClass": "armorClass",
  "details.strength": "strength",
  "details.stealthDisadvantage": "stealth",
  "details.bonusWeapon": "bonusWeapon",
  "details.bonusAc": "bonusAc",
  "details.charges": "charges",
  "details.recharge": "recharge",
  "details.rechargeAmount": "rechargeAmount",
};

/** Lists whose entries have a control of their own (`aliases.1`; a spell's is its chip's Remove). */
const LIST_FIELDS: Record<string, string> = {
  aliases: "aliases",
  "details.properties": "properties",
  "details.mastery": "mastery",
  "details.spells": "spells",
};

/** Lists drawn the same in both presentations: an entry is its own target there too. */
const CHIP_LISTS = new Set(["spells"]);

/** Each field's target in the targets presentation. Fields not listed are their own target. */
const FIELD_REGIONS: Record<string, string> = {
  category: "subtitle",
  rarity: "subtitle",
  attunement: "subtitle",
  attunementNote: "subtitle",
  page: "source",
  damageDice: "damage",
  damageType: "damage",
  versatileDice: "damage",
  rechargeAmount: "recharge",
};

/** The live field that fixes a path (`weightLb`, `damageDice`, `aliases.1`), or null when none does. */
export const liveIssueTargetId = (path: string): string | null => {
  for (const [prefix, id] of Object.entries(LIST_FIELDS)) {
    if (path === prefix) return id;
    if (path.startsWith(`${prefix}.`)) return `${id}.${path.slice(prefix.length + 1).split(".")[0]}`;
  }
  return PATH_FIELDS[path] ?? null;
};

/** The target that shows a live field: `damageDice` is in "damage", `aliases.1` in "aliases". */
export const itemFieldRegion = (id: string): string => {
  const field = id.split(".")[0];
  return FIELD_REGIONS[field] ?? field;
};

/** The target whose editor fixes a path, or null when none does. */
export const issueTargetId = (path: string): string | null => {
  const id = liveIssueTargetId(path);
  if (id === null) return null;
  return CHIP_LISTS.has(id.split(".")[0]) ? id : itemFieldRegion(id);
};

const FIELD_PLACES: Record<string, string> = {
  name: "Name", source: "Source", page: "Page", category: "Category", rarity: "Rarity", attunement: "Attunement",
  attunementNote: "Attunement note", valueCp: "Value", weightLb: "Weight", base: "Base item", description: "Description",
  weaponCategory: "Weapon category", damageDice: "Damage dice", damageType: "Damage type",
  versatileDice: "Versatile damage", range: "Range", armorClass: "Armor Class", strength: "Strength", stealth: "Stealth",
  bonusWeapon: "Attack and damage", bonusAc: "AC bonus", charges: "Charges", recharge: "Recharge",
  rechargeAmount: "Recharge amount", aliases: "Also called", properties: "Properties", mastery: "Mastery", spells: "Spells",
};

/** Where a path is, in the sheet's words: "Weight", "Also called", "Spells: Fireball". */
const describePath = (path: string, draft: ItemDraft): string => {
  const id = liveIssueTargetId(path);
  if (id === null) return path === "details" || path === "" ? "Item" : path;
  const [field, index] = id.split(".");
  if (field === "spells") {
    const position = path.split(".")[2];
    const spell = position === undefined ? undefined : draft.spells?.[Number(position)];
    return spell?.name ? `Spells: ${spell.name}` : "Spells";
  }
  const place = FIELD_PLACES[field] ?? field;
  return index === undefined ? place : `${place}: entry ${Number(index) + 1}`;
};

const PLACEMENTS: Record<SheetPresentation, IssuePlacement<ItemDraft>> = {
  targets: { issueTargetId, issueFocusId: liveIssueTargetId, describePath },
  live: { issueTargetId: liveIssueTargetId, describePath },
};

/** Issues placed for the presentation the sheet is in: a live field, or the target whose editor fixes it. */
export const placeIssues = (
  issues: readonly WriteIssue[],
  draft: ItemDraft,
  presentation: SheetPresentation,
): PlacedIssue<WriteIssue>[] => placeSheetIssues(issues, draft, PLACEMENTS[presentation]);
