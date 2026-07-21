import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInlineTags, parseRichTextBlocks, stripInlineTags } from "../../shared/domain/dnd5e/richText.js";
import { buildSpellLookup, resolveSpell, validateSpellInput } from "../../shared/domain/dnd5e/spell.js";
import { normalizeSpellcasting } from "../src/utils/dnd5etools/spellcasting-normalizer.js";
import { transformDnd5eToolsMonster } from "../src/utils/dnd5etools/monster-transformer.js";
import { findUnresolvedSpellRefs } from "../src/utils/dnd5etools/spell-references.js";
import {
  buildSpellClassLookup,
  parseDnd5eToolsSpells,
  transformDnd5eToolsSpell,
} from "../src/utils/dnd5etools/spell-transformer.js";

// Fixtures are trimmed copies of spells from 5etools spells-xphb.json.
const fireball = {
  name: "Fireball", source: "XPHB", page: 274, level: 3, school: "V",
  time: [{ number: 1, unit: "action" }],
  range: { type: "point", distance: { type: "feet", amount: 150 } },
  components: { v: true, s: true, m: "a ball of bat guano and sulfur" },
  duration: [{ type: "instant" }],
  entries: [
    "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius {@variantrule Sphere [Area of Effect]|XPHB|Sphere} centered on that point makes a Dexterity saving throw, taking {@damage 8d6} Fire damage on a failed save or half as much damage on a successful one.",
    "Flammable objects in the area that aren't being worn or carried start {@hazard burning|XPHB}.",
  ],
  entriesHigherLevel: [{
    type: "entries", name: "Using a Higher-Level Spell Slot",
    entries: ["The damage increases by {@scaledamage 8d6|3-9|1d6} for each spell slot level above 3."],
  }],
  damageInflict: ["fire"], savingThrow: ["dexterity"],
};

const fireBolt = {
  name: "Fire Bolt", source: "XPHB", page: 274, level: 0, school: "V",
  time: [{ number: 1, unit: "action" }],
  range: { type: "point", distance: { type: "feet", amount: 120 } },
  components: { v: true, s: true },
  duration: [{ type: "instant" }],
  entries: ["You hurl a mote of fire at a creature or an object within range. On a hit, the target takes {@damage 1d10} Fire damage."],
  entriesHigherLevel: [{
    type: "entries", name: "Cantrip Upgrade",
    entries: ["The damage increases by {@damage 1d10} when you reach levels 5 ({@damage 2d10}), 11 ({@damage 3d10}), and 17 ({@damage 4d10})."],
  }],
  damageInflict: ["fire"], spellAttack: ["R"], alias: ["Firebolt"],
};

const shield = {
  name: "Shield", source: "XPHB", page: 316, level: 1, school: "A",
  time: [{ number: 1, unit: "reaction", condition: "which you take when you are hit by an attack roll or targeted by the Magic Missile spell" }],
  range: { type: "point", distance: { type: "self" } },
  components: { v: true, s: true },
  duration: [{ type: "timed", duration: { type: "round", amount: 1 } }],
  entries: ["An imperceptible barrier of magical force protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from {@spell Magic Missile|XPHB}."],
};

const chromaticOrb = {
  name: "Chromatic Orb", source: "XPHB", level: 1, school: "V",
  time: [{ number: 1, unit: "action" }],
  range: { type: "point", distance: { type: "feet", amount: 90 } },
  components: { v: true, s: true, m: { text: "a diamond worth 50+ GP", cost: 5000 } },
  duration: [{ type: "instant" }],
  entries: ["You hurl an orb of energy at a target within range."],
};

const augury = {
  name: "Augury", source: "XPHB", page: 244, level: 2, school: "D",
  time: [{ number: 1, unit: "minute" }],
  range: { type: "point", distance: { type: "self" } },
  components: { v: true, s: true, m: { text: "specially marked sticks, bones, cards, or other divinatory tokens worth 25+ GP", cost: 2500 } },
  duration: [{ type: "instant" }],
  meta: { ritual: true },
  entries: [
    "You receive an omen from an otherworldly entity. The DM chooses the omen from the Omens table.",
    { type: "table", caption: "Omens", colLabels: ["Omen", "For Results That Will Be..."], rows: [["Weal", "Good"], ["Woe", "Bad"]] },
    "If you cast the spell more than once before finishing a {@variantrule Long Rest|XPHB}, there is a cumulative {@chance 25|||Random reading!|Regular reading} chance for each casting after the first that you get no answer.",
  ],
};

const auraOfVitality = {
  name: "Aura of Vitality", source: "XPHB", level: 3, school: "A",
  time: [{ number: 1, unit: "action" }],
  range: { type: "emanation", distance: { type: "feet", amount: 30 } },
  components: { v: true },
  duration: [{ type: "timed", duration: { type: "minute", amount: 1 }, concentration: true }],
  entries: ["An aura radiates from you in a 30-foot {@variantrule Emanation [Area of Effect]|XPHB|Emanation} for the duration."],
};

const continualFlame = {
  name: "Continual Flame", source: "XPHB", level: 2, school: "V",
  time: [{ number: 1, unit: "action" }],
  range: { type: "point", distance: { type: "touch" } },
  components: { v: true, s: true, m: { text: "ruby dust worth 50+ GP, which the spell consumes", cost: 5000, consume: true } },
  duration: [{ type: "permanent", ends: ["dispel"] }],
  entries: ["A flame springs from an object that you touch."],
};

const plantGrowth = {
  name: "Plant Growth", source: "XPHB", level: 3, school: "T",
  time: [{ number: 1, unit: "action", note: "Overgrowth" }, { number: 8, unit: "hour", note: "Enrichment" }],
  range: { type: "point", distance: { type: "feet", amount: 150 } },
  components: { v: true, s: true },
  duration: [{ type: "instant" }],
  entries: [
    "This spell channels vitality into plants.",
    { type: "entries", name: "Overgrowth", entries: ["Choose a point within range."] },
    { type: "list", items: [{ type: "item", name: "Enrichment", entries: ["All plants in range become enriched."] }, "Plain item."] },
  ],
};

// Trimmed gendata-spell-source-lookup.json entry.
const classLookup = buildSpellClassLookup({
  xphb: {
    fireball: { class: { XPHB: { Sorcerer: true, Wizard: true }, WoW: { Mage: { definedInSources: ["WoW"] } } } },
  },
});

test("fireball: casting, range, material string, tags, classes and scaledamage", () => {
  const { spell, tags, warnings } = transformDnd5eToolsSpell(fireball, classLookup);

  assert.deepEqual(warnings, []);
  assert.equal(spell.school, "evocation");
  assert.equal(spell.casting_time, "1 action");
  assert.equal(spell.casting_unit, "action");
  assert.equal(spell.range_text, "150 feet");
  assert.equal(spell.range_feet, 150);
  assert.equal(spell.material, "a ball of bat guano and sulfur");
  assert.equal(spell.material_cost_cp, null);
  assert.equal(spell.duration, "Instantaneous");
  assert.equal(spell.concentration, false);
  assert.equal(spell.description.split("\n\n").length, 2);
  assert.match(spell.description, /20-foot-radius Sphere centered .* taking 8d6 Fire damage/);
  assert.equal(spell.higher_levels, "The damage increases by 1d6 for each spell slot level above 3.");
  assert.deepEqual(tags, [
    { tag_type: "class", tag: "Sorcerer" },
    { tag_type: "class", tag: "Wizard" },
    { tag_type: "damage", tag: "fire" },
    { tag_type: "save", tag: "dexterity" },
  ]);
});

test("fire bolt: cantrip upgrade without heading, alias and ranged attack", () => {
  const { spell, tags } = transformDnd5eToolsSpell(fireBolt);

  assert.equal(spell.level, 0);
  assert.equal(spell.higher_levels, "The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).");
  assert.deepEqual(tags, [
    { tag_type: "damage", tag: "fire" },
    { tag_type: "attack", tag: "ranged" },
    { tag_type: "alias", tag: "Firebolt" },
  ]);
});

test("shield: reaction trigger, round duration and a kept {@spell} reference", () => {
  const { spell } = transformDnd5eToolsSpell(shield);

  assert.equal(spell.casting_time, "1 reaction");
  assert.equal(spell.casting_unit, "reaction");
  assert.match(spell.casting_trigger ?? "", /^which you take when you are hit/);
  assert.equal(spell.range_text, "Self");
  assert.equal(spell.range_feet, null);
  assert.equal(spell.duration, "1 round");
  assert.match(spell.description, /no damage from \{@spell Magic Missile\|XPHB\}\.$/);
});

test("costly, consumed materials; emanation; concentration; until dispelled", () => {
  const orb = transformDnd5eToolsSpell(chromaticOrb).spell;
  assert.equal(orb.material, "a diamond worth 50+ GP");
  assert.equal(orb.material_cost_cp, 5000);
  assert.equal(orb.material_consumed, false);

  const flame = transformDnd5eToolsSpell(continualFlame).spell;
  assert.equal(flame.material_consumed, true);
  assert.equal(flame.duration, "Until dispelled");
  assert.equal(flame.range_text, "Touch");

  const aura = transformDnd5eToolsSpell(auraOfVitality).spell;
  assert.equal(aura.range_text, "Self (30-foot emanation)");
  assert.equal(aura.duration, "Concentration, up to 1 minute");
  assert.equal(aura.concentration, true);
  assert.equal(aura.comp_m, false);
});

test("augury: ritual, table block and chance", () => {
  const { spell } = transformDnd5eToolsSpell(augury);

  assert.equal(spell.ritual, true);
  assert.equal(spell.casting_unit, "minute");
  assert.match(spell.description, /cumulative 25 percent chance/);

  const blocks = parseRichTextBlocks(spell.description);
  assert.deepEqual(blocks[1], {
    type: "table",
    caption: "Omens",
    header: ["Omen", "For Results That Will Be..."],
    rows: [["Weal", "Good"], ["Woe", "Bad"]],
  });
});

test("plant growth: two casting times, lead-ins and list items", () => {
  const { spell } = transformDnd5eToolsSpell(plantGrowth);

  assert.equal(spell.casting_time, "1 action (Overgrowth) or 8 hours (Enrichment)");
  assert.equal(spell.casting_unit, "action");
  assert.deepEqual(parseRichTextBlocks(spell.description), [
    { type: "paragraph", text: "This spell channels vitality into plants." },
    { type: "paragraph", lead: "Overgrowth.", text: "Choose a point within range." },
    {
      type: "list",
      items: [
        { lead: "Enrichment.", text: "All plants in range become enriched." },
        { text: "Plain item." },
      ],
    },
  ]);
});

test("invalid spells throw; parse accepts {spell: []} and bare arrays", () => {
  assert.throws(() => transformDnd5eToolsSpell({ ...fireball, level: 12 }), /level must be 0-9/);
  assert.throws(() => transformDnd5eToolsSpell({ ...fireball, school: "Q" }), /unknown school/);
  assert.equal(parseDnd5eToolsSpells({ spell: [fireball, shield] }).length, 2);
  assert.equal(parseDnd5eToolsSpells([fireball]).length, 1);
});

test("parseInlineTags and stripInlineTags", () => {
  assert.deepEqual(parseInlineTags("Casts {@spell Misty Step|XPHB}, then {@spell fireball||Fireball} or {@spell Fly}."), [
    { type: "text", text: "Casts " },
    { type: "spell", name: "Misty Step", source: "XPHB" },
    { type: "text", text: ", then " },
    { type: "spell", name: "fireball", display: "Fireball" },
    { type: "text", text: " or " },
    { type: "spell", name: "Fly" },
    { type: "text", text: "." },
  ]);
  assert.equal(stripInlineTags("Casts {@spell Misty Step|XPHB} and {@creature Ghoul|XMM|Ghouls}."), "Casts Misty Step and Ghouls.");
});

test("parseRichTextBlocks keeps pipes inside tags in table cells", () => {
  assert.deepEqual(parseRichTextBlocks("| Roll | Spell |\n| 1 | {@spell Fly|XPHB} |"), [
    { type: "table", header: ["Roll", "Spell"], rows: [["1", "{@spell Fly|XPHB}"]] },
  ]);
});

test("resolveSpell: name + source, alias, homebrew first without a source", () => {
  const spells = [
    { id: 1, name: "Fire Bolt", source: "XPHB", aliases: ["Firebolt"] },
    { id: 2, name: "Fireball", source: "XPHB", aliases: [] },
    { id: 3, name: "Fireball", source: "homebrew", aliases: [] },
  ];
  const lookup = buildSpellLookup(spells);

  assert.equal(resolveSpell(lookup, { name: "fireball", source: "xphb" })?.id, 2);
  assert.equal(resolveSpell(lookup, { name: "Fireball" })?.id, 3);
  assert.equal(resolveSpell(lookup, { name: "Firebolt", source: "XPHB" })?.id, 1);
  assert.equal(resolveSpell(lookup, { name: "Fireball", source: "PHB" }), undefined);
  assert.equal(resolveSpell(lookup, { name: "Wish" }), undefined);
});

test("monster text keeps {@spell} in descriptions but not in names or spell lists", () => {
  const { entity } = transformDnd5eToolsMonster({
    name: "Test Mage",
    source: "XMM",
    trait: [{ name: "{@spell Shield|XPHB} Ward", entries: ["When hit, it casts {@spell Shield|XPHB} at {@dc 15}."] }],
    spellcasting: [{
      name: "Misty Step (3/Day)",
      type: "spellcasting",
      headerEntries: ["The mage casts {@spell Misty Step|XPHB}, using the same spellcasting ability as Spellcasting."],
      daily: { "3": ["{@spell Misty Step|XPHB}"] },
      ability: "int",
      displayAs: "bonus",
      hidden: ["daily"],
    }],
    legendaryHeader: ["It can cast {@spell Fly|XPHB} as a legendary action."],
  });

  assert.equal(entity.traits?.[0].name, "Shield Ward");
  assert.equal(entity.traits?.[0].description, "When hit, it casts {@spell Shield|XPHB} at DC 15.");
  assert.deepEqual(entity.spellcasting?.[0].descriptions, [
    "The mage casts {@spell Misty Step|XPHB}, using the same spellcasting ability as Spellcasting.",
  ]);
  assert.deepEqual(entity.spellcasting?.[0].frequency_groups?.[0].spells, [{ name: "Misty Step", source: "XPHB" }]);
  assert.deepEqual(entity.legendary_header, ["It can cast {@spell Fly|XPHB} as a legendary action."]);

  const unresolved = findUnresolvedSpellRefs([entity], [{ name: "Misty Step", source: "XPHB", aliases: [] }]);
  assert.deepEqual(unresolved.map(ref => ref.name), ["Fly", "Shield"]);
});

test("spellcasting save DC and attack bonus are still read with kept tags", () => {
  const [block] = normalizeSpellcasting([{
    name: "Spellcasting",
    type: "spellcasting",
    headerEntries: ["It casts {@spell Fireball|XPHB} (spell save {@dc 17}, {@hit 9} to hit with spell attacks):"],
    will: ["{@spell Fireball|XPHB}"],
  }], []);

  assert.equal(block.save_dc, 17);
  assert.equal(block.spell_attack_bonus, 9);
  assert.deepEqual(block.descriptions, ["It casts {@spell Fireball|XPHB}:"]);
});

const validInput = {
  name: "Ember Lance", source: "homebrew", level: 2, school: "evocation", ritual: false, concentration: false,
  castingTime: "1 action", castingUnit: "action", range: "60 feet", rangeFeet: 60,
  components: { v: true, s: true, m: false }, materialConsumed: false, duration: "Instantaneous",
  description: "A lance of fire.", classes: ["Wizard"], damageTypes: ["fire"], saves: [], conditions: [], aliases: [],
};

test("validateSpellInput accepts a complete spell and lists every problem", () => {
  assert.deepEqual(validateSpellInput(validInput), []);
  assert.deepEqual(
    validateSpellInput({
      ...validInput,
      name: " ",
      level: 10,
      school: "chronomancy",
      castingUnit: "turn",
      material: "a ruby",
      classes: ["Wizard", ""],
      attack: "thrown",
    }),
    [
      "Name is required.",
      "Level must be a whole number from 0 (cantrip) to 9.",
      "Choose a school of magic.",
      "Choose a casting time unit.",
      "A material or its cost needs the M component.",
      "Classes must be a list of names.",
      "Spell attack must be melee or ranged.",
    ]
  );
  assert.deepEqual(validateSpellInput(null), ["The spell must be an object."]);
});
