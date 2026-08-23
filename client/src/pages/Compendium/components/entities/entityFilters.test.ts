import { describe, expect, test } from "vitest";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import {
  EMPTY_ENTITY_FILTERS,
  collectEntityFilterOptions,
  filterEntities,
  sortEntities,
  type EntityFilterState,
} from "./entityFilters.js";

const entity = (templateId: number, name: string, patch: Partial<DnD5eEntitySummary> = {}): DnD5eEntitySummary => ({
  templateId,
  name,
  role: "creature",
  hp: 10,
  size: "medium",
  featuredNpc: false,
  source: "homebrew",
  imported: false,
  locallyEdited: false,
  ...patch,
});

const mara = entity(1, "Mara", { role: "npc", featuredNpc: true, cr: "2", creatureType: "humanoid", hp: 27 });
const maraTwin = entity(2, "Mara", { role: "npc", cr: "2", creatureType: "humanoid", hp: 27 });
const aria = entity(3, "Aria", { role: "pc", inParty: true, hp: 40 });
const bram = entity(4, "Bram", { role: "pc", inParty: false, hp: 33 });
const rat = entity(5, "Rat", { cr: "0", creatureType: "beast", size: "tiny", hp: 1 });
const goblin = entity(6, "Goblin", { cr: "1/4", creatureType: "humanoid", size: "small", hp: 7 });
const imp = entity(7, "Imp", { cr: "1/2", creatureType: "fiend", size: "tiny", hp: 10 });
const ogre = entity(8, "Ogre", { cr: "10", creatureType: "giant", size: "large", hp: 59 });
const ogreTwo = entity(9, "Ogre", { cr: "2", creatureType: "Giant", size: "large", hp: 59 });
const oddity = entity(10, "Oddity", { cr: "unknown", creatureType: "aberration" });

const ALL = [mara, maraTwin, aria, bram, rat, goblin, imp, ogre, ogreTwo, oddity];

const filter = (patch: Partial<EntityFilterState>) =>
  filterEntities(ALL, { ...EMPTY_ENTITY_FILTERS, ...patch }).map(item => item.templateId);

describe("entity views", () => {
  test("Party is PCs marked as party members; PCs includes a PC outside the party", () => {
    expect(filter({ view: "party" })).toEqual([aria.templateId]);
    expect(filter({ view: "pcs" })).toEqual([aria.templateId, bram.templateId]);
  });

  test("Featured NPCs holds only featured NPCs, and NPCs includes featured and ordinary NPCs of the same name", () => {
    expect(filter({ view: "featured" })).toEqual([mara.templateId]);
    expect(filter({ view: "npcs" })).toEqual([mara.templateId, maraTwin.templateId]);
  });

  test("Creatures excludes PCs and NPCs, and All shows everything", () => {
    expect(filter({ view: "creatures" })).toEqual([5, 6, 7, 8, 9, 10]);
    expect(filter({ view: "all" })).toHaveLength(ALL.length);
  });
});

describe("entity filters", () => {
  test("name search is case-insensitive and combines with the view, type and size", () => {
    expect(filter({ search: "mAR" })).toEqual([mara.templateId, maraTwin.templateId]);
    expect(filter({ search: "mar", view: "featured" })).toEqual([mara.templateId]);
    expect(filter({ creatureType: "giant", size: "large" })).toEqual([ogre.templateId, ogreTwo.templateId]);
    expect(filter({ creatureType: "humanoid", view: "creatures" })).toEqual([goblin.templateId]);
  });

  test("CR bounds compare fractions numerically, are inclusive and allow CR 0", () => {
    expect(filter({ crMin: "0", crMax: "1/2" })).toEqual([rat.templateId, goblin.templateId, imp.templateId]);
    expect(filter({ crMin: "1/4", crMax: "2" })).toEqual([mara.templateId, maraTwin.templateId, goblin.templateId, imp.templateId, ogreTwo.templateId]);
    // Lexically "10" < "2"; numerically it is above the bound.
    expect(filter({ crMax: "2" })).not.toContain(ogre.templateId);
    expect(filter({ crMin: "2" })).toEqual([mara.templateId, maraTwin.templateId, ogre.templateId, ogreTwo.templateId]);
  });

  test("missing or unparseable CR is excluded only while a CR bound is active", () => {
    expect(filter({})).toEqual(expect.arrayContaining([aria.templateId, oddity.templateId]));
    expect(filter({ crMin: "0" })).not.toContain(aria.templateId);
    expect(filter({ crMin: "0" })).not.toContain(oddity.templateId);
    expect(filter({ crMin: "0" })).toContain(rat.templateId);
  });
});

describe("entity sorting", () => {
  const ids = (sort: Parameters<typeof sortEntities>[1], list = ALL) => sortEntities(list, sort).map(item => item.templateId);

  test("name order breaks ties by template ID", () => {
    expect(ids("name")).toEqual([3, 4, 6, 7, 1, 2, 10, 8, 9, 5]);
  });

  test("CR sorts numerically, with missing and unparseable CR last in both directions", () => {
    expect(ids("cr-asc")).toEqual([5, 6, 7, 1, 2, 9, 8, 3, 4, 10]);
    expect(ids("cr-desc")).toEqual([8, 1, 2, 9, 7, 6, 5, 3, 4, 10]);
  });

  test("template HP sorts in either direction with name and ID as tie-breakers", () => {
    expect(ids("hp-asc", [ogreTwo, ogre, rat, aria])).toEqual([5, 3, 8, 9]);
    expect(ids("hp-desc", [ogreTwo, ogre, rat, aria])).toEqual([8, 9, 3, 5]);
  });

  test("sorting leaves the input untouched", () => {
    const input = [ogre, rat];
    sortEntities(input, "cr-asc");
    expect(input).toEqual([ogre, rat]);
  });
});

describe("filter choices from the loaded index", () => {
  test("types are distinct ignoring case, sizes run small to large, and CRs run by value", () => {
    const options = collectEntityFilterOptions(ALL);
    expect(options.creatureTypes).toEqual(["aberration", "beast", "fiend", "giant", "humanoid"]);
    expect(options.sizes).toEqual(["tiny", "small", "medium", "large"]);
    expect(options.crs).toEqual(["0", "1/4", "1/2", "2", "10"]);
  });
});
