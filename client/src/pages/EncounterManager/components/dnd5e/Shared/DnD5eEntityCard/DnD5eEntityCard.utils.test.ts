import { describe, expect, test } from "vitest";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { WIDE_CARD_MIN_SECTION_CHARS, fillsWideCard } from "./DnD5eEntityCard.utils.js";

const entity = (patch: Partial<DnD5eEntityDetails> = {}): DnD5eEntityDetails => ({
  templateId: 1,
  name: "Test",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "creature",
  ac: 12,
  hp: 20,
  speeds: { walk: 30 },
  size: "medium",
  alignment: "neutral",
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  ...patch,
});

const text = (length: number) => "x".repeat(length);

describe("fillsWideCard", () => {
  test("a creature with a short action keeps the single-column card", () => {
    expect(fillsWideCard(entity({ actions: [{ name: "Bite", description: "Melee attack.", actionType: "action" }] }))).toBe(false);
  });

  test("traits and actions together count towards the threshold, wherever they sit", () => {
    const half = WIDE_CARD_MIN_SECTION_CHARS / 2;
    const onlyTrait = entity({ traits: [{ name: "", description: text(half) }] });
    expect(fillsWideCard(onlyTrait)).toBe(false);

    const traitAndReaction = entity({
      traits: [{ name: "", description: text(half) }],
      actions: [{ name: "", description: text(half), actionType: "reaction" }],
    });
    expect(fillsWideCard(traitAndReaction)).toBe(true);
  });

  test("a spellcaster's descriptions and spell lists count as text", () => {
    const spells = Array.from({ length: 30 }, (_, index) => ({ name: `Spell number ${index}` }));
    const caster = entity({
      spellcasting: [{ name: "Spellcasting", descriptions: [text(200)], levels: [{ level: 1, spells }] }],
    });
    expect(fillsWideCard(caster)).toBe(true);
    expect(fillsWideCard(entity({ spellcasting: [{ name: "Spellcasting", descriptions: [text(200)] }] }))).toBe(false);
  });
});
