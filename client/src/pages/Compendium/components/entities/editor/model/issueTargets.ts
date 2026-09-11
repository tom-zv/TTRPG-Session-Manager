import type { EntityWriteIssue } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { ABILITY_FULL_NAMES, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import { placeIssues as placeSheetIssues, type IssuePlacement, type PlacedIssue } from "../../../sheetEditor/issues.js";
import type { SheetPresentation } from "../../../sheetEditor/usePresentation.js";
import type { EntityDraft } from "./defaults.js";

// The edit target that owns each top-level field, where its id is not the field name itself.
const FIELD_TARGETS: Record<string, string> = {
  size: "subtitle",
  creatureType: "subtitle",
  typeTags: "subtitle",
  alignment: "subtitle",
  role: "subtitle",
  hpFormula: "hp",
  passivePerception: "senses",
};

const OWN_TARGETS = new Set([
  "name", "ac", "hp", "cr", "imageUrl", "speeds", "saves", "skills", "senses", "languages",
  "resistances", "immunities", "vulnerabilities", "conditionImmunities",
  "legendaryActionCount", "legendaryHeader",
]);

const FIELD_PLACES: Record<string, string> = {
  name: "Name", ac: "Armor Class", hp: "Hit Points", hpFormula: "HP formula", cr: "Challenge Rating",
  imageUrl: "Token image", speeds: "Speed", size: "Size", creatureType: "Creature type", typeTags: "Type tags",
  alignment: "Alignment", role: "Role", saves: "Saving Throws", skills: "Skills",
  passivePerception: "Passive Perception", senses: "Senses", languages: "Languages",
  resistances: "Resistances", immunities: "Immunities", vulnerabilities: "Vulnerabilities",
  conditionImmunities: "Condition Immunities", legendaryActionCount: "Legendary actions per round",
  legendaryHeader: "Legendary introduction", settings: "Behaviour settings", abilityScores: "Ability scores",
  traits: "Traits", actions: "Actions", spellcasting: "Spellcasting",
};

const ENTRY_LISTS = new Set(["traits", "actions", "spellcasting"]);
const isIndex = (segment: string | undefined): segment is string => segment !== undefined && /^\d+$/.test(segment);

/**
 * The editor that fixes a validator path. Paths follow the shared validator: `ac`,
 * `abilityScores.str`, `actions.3.name`, `spellcasting.0.levels.2.slots`. A trait's or action's
 * issue is on its name or its text (`actions.3.description`); any other part of it (its order, its
 * section) goes to the name. A spellcasting block opens its card (`spellcasting.0`). Settings and
 * unknown paths have no editor.
 */
export const issueTargetId = (path: string): string | null => {
  const [field, second, third] = path.split(".");
  if (field === "traits" || field === "actions") {
    return isIndex(second) ? `${field}.${second}.${third === "description" ? "description" : "name"}` : null;
  }
  if (ENTRY_LISTS.has(field)) return isIndex(second) ? `${field}.${second}` : null;
  if (field === "abilityScores") return second && second in ABILITY_FULL_NAMES ? `abilityScores.${second}` : null;
  return FIELD_TARGETS[field] ?? (OWN_TARGETS.has(field) ? field : null);
};

// Lines whose values are each their own live field, addressed `<field>.<key or index>` like the paths.
const KEYED_LIVE_FIELDS = new Set([
  "speeds", "saves", "skills", "typeTags", "senses", "languages",
  "resistances", "immunities", "vulnerabilities", "conditionImmunities",
]);
// Lines that are one live field each. The token image and the legendary introduction have none.
const OWN_LIVE_FIELDS = new Set([
  "name", "ac", "hp", "hpFormula", "cr", "size", "creatureType", "alignment", "role", "passivePerception", "legendaryActionCount",
]);

/**
 * The live field that fixes a path, on a live sheet: the exact field (`hpFormula`, `alignment`,
 * `speeds.fly`, `languages.1`, `actions.3.description`). A jump falls back to the line's add
 * control or first field when that one is absent (see `useOpenEditor`'s `focusLive`). Spellcasting
 * blocks, the token image and the legendary introduction open their editors, as on targets.
 */
export const liveIssueTargetId = (path: string): string | null => {
  const [field, second] = path.split(".");
  if (KEYED_LIVE_FIELDS.has(field)) return second ? `${field}.${second}` : field;
  if (OWN_LIVE_FIELDS.has(field)) return field;
  return issueTargetId(path);
};

/**
 * The region of the targets presentation that shows a live field: the target whose editor edits
 * it. A save cell is its own region; the rest follow the issue targets.
 */
export const liveFieldRegion = (id: string): string => (id.startsWith("saves.") ? id : issueTargetId(id) ?? id);

const describePath = (path: string, draft: EntityDraft): string => {
  const [field, second] = path.split(".");
  if (ENTRY_LISTS.has(field) && isIndex(second)) {
    const entry = draft[field as "traits" | "actions" | "spellcasting"]?.[Number(second)];
    const name = entry?.name.trim();
    return `${FIELD_PLACES[field]}: ${name || `entry ${Number(second) + 1}`}`;
  }
  if (field === "abilityScores" && second && second in ABILITY_FULL_NAMES) return ABILITY_FULL_NAMES[second as AbilityKey];
  return FIELD_PLACES[field] ?? (path || "Entity");
};

/** An entry's text, which is the same source textarea in both presentations. */
export const isEntryTextId = (id: string): boolean => /^(traits|actions)\.\d+\.description$/.test(id);

const PLACEMENTS: Record<SheetPresentation, IssuePlacement<EntityDraft>> = {
  targets: { issueTargetId, issueFocusId: path => path, describePath },
  live: { issueTargetId: liveIssueTargetId, describePath },
};

/** Issues placed for the presentation the sheet is in: a live field, or the target whose editor fixes it. */
export const placeIssues = (
  issues: readonly EntityWriteIssue[],
  draft: EntityDraft,
  presentation: SheetPresentation = "targets",
): PlacedIssue<EntityWriteIssue>[] => placeSheetIssues(issues, draft, PLACEMENTS[presentation]);
