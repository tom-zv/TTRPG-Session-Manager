import type { EntityWriteIssue } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { ABILITY_FULL_NAMES, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import type { EntityDraft } from "./defaults.js";

/** A write issue placed on the sheet: the editor that fixes it (null when none does) and a readable place. */
export type PlacedIssue = EntityWriteIssue & { targetId: string | null; place: string };

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
 * `abilityScores.str`, `actions.3.name`, `spellcasting.0.levels.2.slots`. Entries open their card
 * (`actions.3`); settings and unknown paths have no editor.
 */
export const issueTargetId = (path: string): string | null => {
  const [field, second] = path.split(".");
  if (ENTRY_LISTS.has(field)) return isIndex(second) ? `${field}.${second}` : null;
  if (field === "abilityScores") return second && second in ABILITY_FULL_NAMES ? `abilityScores.${second}` : null;
  return FIELD_TARGETS[field] ?? (OWN_TARGETS.has(field) ? field : null);
};

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

export const placeIssues = (issues: readonly EntityWriteIssue[], draft: EntityDraft): PlacedIssue[] =>
  issues.map(issue => ({ ...issue, targetId: issueTargetId(issue.path), place: describePath(issue.path, draft) }));
