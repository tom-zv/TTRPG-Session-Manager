import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeSpellcasting } from "../../../src/utils/5etools/spellcasting-normalizer.js";
import { render5eToolsText } from "../../../src/utils/5etools/text-renderer.js";

// Fixtures are trimmed copies of blocks from 5etools bestiary-xmm.json.
const mage = [
  {
    name: "Spellcasting",
    type: "spellcasting",
    headerEntries: [
      "The mage casts one of the following spells, using Intelligence as the spellcasting ability (spell save {@dc 14}):",
    ],
    will: ["{@spell Detect Magic|XPHB}", "{@spell Mage Armor|XPHB} (included in AC)"],
    daily: {
      "1e": ["{@spell Cone of Cold|XPHB}", "{@spell Fly|XPHB}"],
      "2e": ["{@spell Fireball|XPHB} (level 4 version)", "{@spell Invisibility|XPHB}"],
    },
    ability: "int",
    displayAs: "action",
  },
  {
    name: "Misty Step (3/Day)",
    type: "spellcasting",
    headerEntries: ["The mage casts {@spell Misty Step|XPHB}, using the same spellcasting ability as Spellcasting."],
    daily: { "3": ["{@spell Misty Step|XPHB}"] },
    ability: "int",
    displayAs: "bonus",
    hidden: ["daily"],
  },
];

test("mage: at-will and daily groups keep notes, sources and stat block order", () => {
  const warnings: string[] = [];
  const [spellcasting, mistyStep] = normalizeSpellcasting(mage, warnings);

  assert.deepEqual(warnings, []);
  assert.equal(spellcasting.save_dc, 14);
  assert.equal(spellcasting.display_as, "action");
  assert.deepEqual(spellcasting.descriptions, [
    "The mage casts one of the following spells, using Intelligence as the spellcasting ability:",
  ]);
  assert.equal(spellcasting.hide_spell_list, undefined);
  assert.deepEqual(spellcasting.frequency_groups, [
    {
      frequency: "will",
      spells: [
        { name: "Detect Magic", source: "XPHB" },
        { name: "Mage Armor", source: "XPHB", note: "included in AC" },
      ],
    },
    {
      frequency: "daily",
      count: 2,
      each: true,
      spells: [
        { name: "Fireball", source: "XPHB", note: "level 4 version" },
        { name: "Invisibility", source: "XPHB" },
      ],
    },
    {
      frequency: "daily",
      count: 1,
      each: true,
      spells: [
        { name: "Cone of Cold", source: "XPHB" },
        { name: "Fly", source: "XPHB" },
      ],
    },
  ]);

  assert.equal(mistyStep.display_as, "bonus action");
  assert.equal(mistyStep.hide_spell_list, true);
  assert.deepEqual(mistyStep.frequency_groups, [
    { frequency: "daily", count: 3, spells: [{ name: "Misty Step", source: "XPHB" }] },
  ]);
});

test("legendary, recharge and long rest groups are kept", () => {
  const warnings: string[] = [];
  const [frightening, spiderQueen, covenMagic] = normalizeSpellcasting([
    {
      name: "Frightening Gaze",
      type: "spellcasting",
      headerEntries: ["The lich casts {@spell Fear|XPHB}, using the same spellcasting ability as Spellcasting."],
      legendary: { "1": ["{@spell Fear|XPHB}"] },
      ability: "int",
      displayAs: "legendary",
      hidden: ["legendary"],
    },
    {
      name: "Magic of the Spider Queen {@recharge 5}",
      type: "spellcasting",
      headerEntries: [
        "The drider casts {@spell Darkness|XPHB} or {@spell Web|XPHB}, using Wisdom as the spellcasting ability (spell save {@dc 14}).",
      ],
      recharge: { "5": ["{@spell Darkness|XPHB}", "{@spell Web|XPHB}"] },
      ability: "wis",
      displayAs: "bonus",
      hidden: ["recharge"],
    },
    {
      name: "Coven Magic",
      type: "spellcasting",
      headerEntries: ["The hag can cast {@spell Augury|XPHB}."],
      restLong: { "1": ["{@spell Augury|XPHB}"] },
      ability: "int",
      hidden: ["restLong"],
    },
  ], warnings);

  assert.deepEqual(warnings, []);
  assert.equal(frightening.display_as, "legendary");
  assert.deepEqual(frightening.frequency_groups, [
    { frequency: "legendary", count: 1, spells: [{ name: "Fear", source: "XPHB" }] },
  ]);

  assert.equal(spiderQueen.name, "Magic of the Spider Queen (Recharge 5-6)");
  assert.equal(spiderQueen.save_dc, 14);
  assert.equal(spiderQueen.hide_spell_list, true);
  assert.deepEqual(spiderQueen.frequency_groups?.map(group => [group.frequency, group.count]), [["recharge", 5]]);

  assert.equal(covenMagic.display_as, undefined);
  assert.deepEqual(covenMagic.frequency_groups?.map(group => [group.frequency, group.count]), [["restLong", 1]]);
});

test("spell attack bonus is read from {@hit} without doubling 'to hit'", () => {
  const [dragon] = normalizeSpellcasting([
    {
      name: "Spellcasting",
      type: "spellcasting",
      headerEntries: [
        "The dragon casts one of the following spells, using Charisma as the spellcasting ability (spell save {@dc 17}, {@hit 9} to hit with spell attacks):",
      ],
      will: ["{@spell Detect Magic|XPHB}"],
      ability: "cha",
      displayAs: "action",
    },
  ], []);

  assert.equal(dragon.save_dc, 17);
  assert.equal(dragon.spell_attack_bonus, 9);
  assert.deepEqual(dragon.descriptions, [
    "The dragon casts one of the following spells, using Charisma as the spellcasting ability:",
  ]);
  assert.equal(render5eToolsText("{@atkr m} {@hit 9}, reach 5 ft."), "Melee Attack Roll: +9, reach 5 ft.");
});

test("slot-based levels, pact magic and rituals (2014 format)", () => {
  const warnings: string[] = [];
  const [warlock] = normalizeSpellcasting([
    {
      name: "Spellcasting",
      headerEntries: ["The warlock is a 5th-level spellcaster ({@hit 6} to hit with spell attacks)."],
      spells: {
        "0": { spells: ["{@spell eldritch blast}", "{@spell eldritch blast}"] },
        "3": { lower: 1, slots: 2, spells: ["{@spell hex}", "{@spell fly}"] },
      },
      ritual: ["{@spell detect magic}"],
      ability: "cha",
      somethingNew: true,
    },
  ], warnings);

  assert.equal(warlock.spell_attack_bonus, 6);
  assert.deepEqual(warlock.levels, [
    { level: 0, slots: undefined, lower_level: undefined, spells: [{ name: "eldritch blast" }] },
    { level: 3, slots: 2, lower_level: 1, spells: [{ name: "hex" }, { name: "fly" }] },
  ]);
  assert.deepEqual(warlock.frequency_groups, [{ frequency: "ritual", spells: [{ name: "detect magic" }] }]);
  assert.deepEqual(warnings, ['Ignored spellcasting key "somethingNew" on "Spellcasting".']);
});
