import { describe, expect, test } from "vitest";
import { prepareBestiary } from "./bestiary.js";
import { createSourceFilter } from "./source-filter.js";
import type { FiveEToolsMonster } from "./types.js";

// Trimmed records in the shape of 5etools data/bestiary/*.json and bestiary/template.json.

const goblinMm: FiveEToolsMonster = {
  name: "Goblin", source: "MM", page: 166, size: ["S"], cr: "1/4", str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
  hp: { average: 7, formula: "2d6" }, senses: ["darkvision 60 ft."], save: { dex: "+4" },
  reprintedAs: ["Goblin Warrior|XMM"],
  trait: [{ name: "Nimble Escape", entries: ["Each turn the goblin can take the Disengage or Hide action as a bonus action."] }],
  action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, one target. {@h}5 ({@damage 1d6 + 2}) slashing damage. {@dc 12} Dexterity save."] }],
};
const goblinWarrior: FiveEToolsMonster = { name: "Goblin Warrior", source: "XMM", page: 144, cr: "1/4" };

const swampTemplate = {
  name: "Swamp", source: "TEST",
  apply: {
    _root: { speed: { walk: 30, swim: 30 } },
    _mod: {
      _: { mode: "addSenses", senses: { type: "darkvision", range: 120 } },
      trait: { mode: "appendArr", items: { name: "Swamp Born", entries: ["<$title_short_name$> holds its breath for an hour. Escape DC <$dc__con$>."] } },
    },
  },
};
const reducedThreat = {
  name: "Reduced Threat", source: "TEST",
  apply: {
    _mod: {
      hp: { mode: "scalarMultProp", prop: "average", scalar: 0.5, floor: true },
      save: { mode: "scalarAddProp", prop: "*", scalar: -2 },
      action: [{ mode: "scalarAddHit", scalar: -2 }, { mode: "scalarAddDc", scalar: -2 }],
    },
  },
};
const templates = { monsterTemplate: [swampTemplate, reducedThreat] };

const bogGoblin: FiveEToolsMonster = {
  name: "Bog Goblin", source: "TEST", page: 3,
  _copy: {
    name: "Goblin", source: "MM",
    _templates: [{ name: "Swamp", source: "TEST" }],
    _mod: { "*": { mode: "replaceTxt", replace: "the goblin", with: "the bog goblin" } },
  },
};

const prepare = (monsters: FiveEToolsMonster[]) => prepareBestiary(structuredClone(monsters), createSourceFilter(), structuredClone(templates));
const find = (monsters: FiveEToolsMonster[], name: string) => {
  const monster = monsters.find(item => item.name === name);
  if (!monster) throw new Error(`${name} was not kept`);
  return monster;
};

describe("bestiary preparation", () => {
  test("a kept monster copying a left-out Monster Manual (2014) creature gets its stat block, text replacements and template", () => {
    const prepared = prepare([goblinMm, goblinWarrior, bogGoblin]);

    expect(prepared.monsters.map(monster => monster.name)).toEqual(["Goblin Warrior", "Bog Goblin"]);
    expect(prepared.excluded).toEqual([{ label: "Goblin|MM", reason: "excluded source MM (2014 core book)" }]);
    expect(prepared.copies).toBe(1);

    const bog = find(prepared.monsters, "Bog Goblin");
    expect(bog).toMatchObject({ source: "TEST", page: 3, cr: "1/4", hp: { average: 7, formula: "2d6" } });
    expect(bog._copy).toBeUndefined();
    // The parent's reprint belongs to the parent: a copy is not left out for it.
    expect(bog.reprintedAs).toBeUndefined();
    // Template root fields and mods; the larger darkvision replaces the parent's.
    expect(bog.speed).toEqual({ walk: 30, swim: 30 });
    expect(bog.senses).toEqual(["darkvision 120 ft."]);
    // "*" replaces text in every entry property; template variables resolve against the copy.
    expect(bog.trait).toEqual([
      { name: "Nimble Escape", entries: ["Each turn the bog goblin can take the Disengage or Hide action as a bonus action."] },
      { name: "Swamp Born", entries: ["The bog goblin holds its breath for an hour. Escape DC 10."] },
    ]);
  });

  test("records reprinted in a kept source are left out, but a reprint into a left-out source keeps the original", () => {
    const prepared = prepare([
      { name: "Old Hag", source: "TEST", reprintedAs: ["Old Hag|XMM"] },
      { name: "Lonely Hag", source: "TEST", reprintedAs: [{ uid: "Lonely Hag|MM" }] },
      { name: "Old Hag", source: "XMM" },
    ]);

    expect(prepared.monsters.map(monster => `${String(monster.name)}|${String(monster.source)}`)).toEqual(["Lonely Hag|TEST", "Old Hag|XMM"]);
    expect(prepared.excluded).toEqual([{ label: "Old Hag|TEST", reason: "reprinted as old hag|xmm" }]);
  });

  test("a copy whose parent or template is missing is reported and left out without blocking the others", () => {
    const prepared = prepare([
      goblinMm,
      { name: "Orphan", source: "TEST", _copy: { name: "Nobody", source: "MM" } },
      { name: "Untemplated", source: "TEST", _copy: { name: "Goblin", source: "MM", _templates: [{ name: "Missing", source: "TEST" }] } },
      goblinWarrior,
    ]);

    expect(prepared.monsters.map(monster => monster.name)).toEqual(["Goblin Warrior"]);
    expect(prepared.failures).toEqual([
      expect.objectContaining({ label: "Orphan|TEST", kind: "unresolved", message: expect.stringContaining("Nobody|MM") }),
      expect.objectContaining({ label: "Untemplated|TEST", kind: "unresolved", message: expect.stringContaining("Missing|TEST") }),
    ]);
  });

  test("a reduced-threat template halves hit points and lowers saves, attack bonuses and DCs", () => {
    const reduced: FiveEToolsMonster = {
      name: "Reduced-Threat Goblin", source: "TEST",
      _copy: { name: "Goblin", source: "MM", _templates: [{ name: "Reduced Threat", source: "TEST" }] },
    };
    const goblin = find(prepare([goblinMm, reduced]).monsters, "Reduced-Threat Goblin");

    expect(goblin.hp).toEqual({ average: 3, formula: "2d6" });
    expect(goblin.save).toEqual({ dex: "+2" });
    expect(goblin.action).toEqual([{
      name: "Scimitar",
      entries: ["{@atk mw} {@hit 2} to hit, one target. {@h}5 ({@damage 1d6 + 2}) slashing damage. {@dc 10} Dexterity save."],
    }]);
  });
});
