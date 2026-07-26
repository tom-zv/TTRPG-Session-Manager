import { describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { EMPTY_SPELL_FILTERS, filterSpells, sortSpells } from "./spellFilters.js";

const spell = (overrides: Partial<SpellSummary>): SpellSummary => ({
  id: 1,
  name: "Spell",
  source: "PHB",
  level: 1,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  castingUnit: "action",
  components: { v: true, s: true, m: false },
  classes: [],
  damageTypes: [],
  saves: [],
  aliases: [],
  ...overrides,
});

const fireBolt = spell({ id: 1, name: "Fire Bolt", level: 0, aliases: ["Firebolt"] });
const alarm = spell({ id: 2, name: "Alarm", level: 1, castingTime: "1 minute", castingUnit: "minute", ritual: true });
const shield = spell({ id: 3, name: "Shield", level: 1, castingTime: "1 reaction", castingUnit: "reaction" });
const fireball = spell({ id: 4, name: "Fireball", level: 3 });
const all = [fireBolt, alarm, shield, fireball];

const names = (spells: SpellSummary[]) => spells.map(entry => entry.name);

describe("spell filters", () => {
  test("name search also matches a spell's aliases", () => {
    expect(names(filterSpells(all, { ...EMPTY_SPELL_FILTERS, search: " firebolt " }))).toEqual(["Fire Bolt"]);
  });

  test("the 'longer' casting filter keeps only spells cast in minutes or hours", () => {
    expect(names(filterSpells(all, { ...EMPTY_SPELL_FILTERS, casting: "longer" }))).toEqual(["Alarm"]);
  });

  test("sorting by level orders by level, then by name within a level", () => {
    expect(names(sortSpells([fireball, shield, alarm, fireBolt], "level"))).toEqual(["Fire Bolt", "Alarm", "Shield", "Fireball"]);
  });
});
