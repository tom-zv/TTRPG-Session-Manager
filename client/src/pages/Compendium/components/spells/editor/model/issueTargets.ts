import type { WriteIssue } from "shared/domain/writeValidation.js";
import { placeIssues as placeSheetIssues, type IssuePlacement, type PlacedIssue } from "../../../sheetEditor/issues.js";
import type { SheetPresentation } from "../../../sheetEditor/usePresentation.js";
import type { SpellDraft } from "./spellDraft.js";

// `validateSpellInput`'s paths (step 03) mapped onto the spell sheet: the live field that fixes each
// one, and the target whose editor shows that field.

/** Paths that name one field. Derived values point at the text they come from. */
const PATH_FIELDS: Record<string, string> = {
  name: "name",
  source: "source",
  page: "page",
  level: "level",
  school: "school",
  ritual: "ritual",
  concentration: "duration",
  castingTime: "castingTime",
  castingUnit: "castingTime",
  castingTrigger: "castingTrigger",
  range: "range",
  rangeFeet: "range",
  components: "v",
  material: "material",
  materialCostCp: "materialCostCp",
  materialConsumed: "materialConsumed",
  duration: "duration",
  description: "description",
  higherLevels: "higherLevels",
  attack: "attack",
};

/** Lists whose entries have a field of their own (`classes.1`). */
const LIST_FIELDS = ["classes", "damageTypes", "saves", "conditions", "aliases"];

/** Fields drawn the same in both presentations: they are their own target there too. */
const SOURCE_TEXTS = new Set(["description", "higherLevels"]);

/** Each field's target in the targets presentation. Fields not listed are their own target. */
const FIELD_REGIONS: Record<string, string> = {
  level: "header",
  school: "header",
  ritual: "header",
  page: "source",
  castingTrigger: "castingTime",
  v: "components",
  s: "components",
  m: "components",
  material: "components",
  materialCostCp: "components",
  materialConsumed: "components",
};

/** The live field that fixes a path (`range`, `classes.1`), or null when none does. */
export const liveIssueTargetId = (path: string): string | null => {
  for (const list of LIST_FIELDS) {
    if (path === list) return list;
    if (path.startsWith(`${list}.`)) return `${list}.${path.slice(list.length + 1).split(".")[0]}`;
  }
  return PATH_FIELDS[path] ?? null;
};

/** The target that shows a live field: `school` is in "header", `classes.1` in "classes". */
export const spellFieldRegion = (id: string): string => {
  const field = id.split(".")[0];
  return FIELD_REGIONS[field] ?? field;
};

/** The target whose editor fixes a path, or null when none does. */
export const issueTargetId = (path: string): string | null => {
  const id = liveIssueTargetId(path);
  if (id === null) return null;
  return SOURCE_TEXTS.has(id) ? id : spellFieldRegion(id);
};

const FIELD_PLACES: Record<string, string> = {
  name: "Name", source: "Source", page: "Page", level: "Level", school: "School", ritual: "Ritual",
  castingTime: "Casting Time", castingTrigger: "Trigger", range: "Range", v: "Components", material: "Material",
  materialCostCp: "Material cost", materialConsumed: "Material consumed", duration: "Duration", description: "Description",
  higherLevels: "Higher levels", attack: "Spell attack", classes: "Classes", damageTypes: "Damage types",
  saves: "Saving throws", conditions: "Conditions", aliases: "Also called",
};

/** Where a path is, in the sheet's words: "Range", "Classes: entry 2". */
const describePath = (path: string): string => {
  const id = liveIssueTargetId(path);
  if (id === null) return path === "" ? "Spell" : path;
  const [field, index] = id.split(".");
  const place = FIELD_PLACES[field] ?? field;
  return index === undefined ? place : `${place}: entry ${Number(index) + 1}`;
};

const PLACEMENTS: Record<SheetPresentation, IssuePlacement<SpellDraft>> = {
  targets: { issueTargetId, issueFocusId: liveIssueTargetId, describePath },
  live: { issueTargetId: liveIssueTargetId, issueFocusId: liveIssueTargetId, describePath },
};

/** Issues placed for the presentation the sheet is in: a live field, or the target whose editor fixes it. */
export const placeIssues = (
  issues: readonly WriteIssue[],
  draft: SpellDraft,
  presentation: SheetPresentation,
): PlacedIssue<WriteIssue>[] => placeSheetIssues(issues, draft, PLACEMENTS[presentation]);
