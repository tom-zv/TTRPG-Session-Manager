import { describe, expect, test } from "vitest";
import { buildItemImportPlan, type ItemImportPlan, type ItemImportRecord } from "./item-transformer.js";
import { fixtureRecords, itemSources } from "../../../tests/fixtures/dnd5eToolsItems.js";

const find = (plan: ItemImportPlan, importKey: string): ItemImportRecord => {
  const record = plan.records.find(item => item.importKey === importKey);
  if (!record) throw new Error(`${importKey} is not in the plan`);
  return record;
};
const specificKeys = (plan: ItemImportPlan) => plan.records.filter(record => record.upstreamKind === "specific").map(record => record.importKey).sort();

describe("item import plan", () => {
  test("a copy chain inherits its ancestors' fields, applies each _mod in order, and copies the page only when preserved", () => {
    const plan = buildItemImportPlan(itemSources());

    const stirring = find(plan, "named:stirring dragon vessel|ftd");
    expect(stirring).toMatchObject({ rarity: "rare", requiresAttunement: true, page: 26, weightLb: 1, category: "wondrous item" });
    expect(stirring.details.description).toBe(
      "This vessel can be a potion bottle, drinking horn, or other container.\n\nStirring. The vessel holds wine.",
    );

    const wakened = find(plan, "named:wakened dragon vessel|ftd");
    expect(wakened).toMatchObject({ rarity: "very rare", requiresAttunement: true });
    expect(wakened.page).toBeUndefined();     // Stirring kept its page through _preserve; Wakened does not ask
    expect(wakened.weightLb).toBeUndefined(); // "weight": null removes the inherited value
    expect(wakened.details.description).toBe([
      "This vessel can be a potion bottle, drinking horn, or other container.",
      "Stirring. The vessel holds wine.",
      "Wakened. The vessel holds a potion of fire breath.",
    ].join("\n\n"));
    // The record as written stays in storage next to the resolved one.
    expect(wakened.details.upstream).toMatchObject({ kind: "named", record: { _copy: { name: "Stirring Dragon Vessel" } } });
  });

  test("a cyclic or dangling _copy is reported and left out without blocking other records", () => {
    const loopA = { name: "Loop A", source: "HB", _copy: { name: "Loop B", source: "HB" } };
    const loopB = { name: "Loop B", source: "HB", _copy: { name: "Loop A", source: "HB" } };
    const orphan = { name: "Orphan", source: "HB", _copy: { name: "Nobody", source: "HB" } };
    const plan = buildItemImportPlan(itemSources({ items: [loopA, loopB, orphan, fixtureRecords.slumbering] }));

    expect(plan.cyclic.map(issue => issue.label).sort()).toEqual(["Loop A|HB", "Loop B|HB"]);
    expect(plan.unresolved).toContainEqual(expect.objectContaining({ label: "Orphan|HB", message: expect.stringContaining("Nobody|HB") }));
    expect(plan.failures.map(issue => issue.label).sort()).toEqual(["Loop A|HB", "Loop B|HB", "Orphan|HB"]);
    expect(plan.records.filter(record => record.upstreamKind === "named").map(record => record.name)).toEqual(["Slumbering Dragon Vessel"]);
  });

  test("specifics are generated once per family and printing, following the upstream edition table, requirements and exclusions", () => {
    const plan = buildItemImportPlan(itemSources());

    expect(specificKeys(plan)).toEqual([
      // classic family: the classic and the edition-less base, never the 2024 base
      "specific:+1 weapon|dmg>longsword|phb",
      "specific:+1 weapon|dmg>pitchfork|hb",
      // edition-less family: the 2024 and the edition-less base, never the classic base; the net is excluded
      "specific:+1 weapon|xdmg>longsword|xphb",
      "specific:+1 weapon|xdmg>pitchfork|hb",
      "specific:armor of fire resistance|dmg>plate armor|phb",
      "specific:barding|phb>plate armor|phb",
      // a copied family keeps its own requirement (swords) and its parent's edition
      "specific:keen +1 weapon|hb>longsword|xphb",
      // a pack of sling bullets takes no variant; the single bullet does
      "specific:silvered ammunition|xdmg>sling bullet|xphb",
    ]);
    expect(plan.counts.byKind.specific).toBe(8);
    expect(plan.counts.byRole).toEqual({ concrete: 7 + 5 + 8, family: 6, group: 1 });
  });

  test("a specific takes the family's name changes, bonuses, text and price over the base item's statistics, and links both parents", () => {
    const plan = buildItemImportPlan(itemSources());

    const longsword = find(plan, "specific:+1 weapon|dmg>longsword|phb");
    expect(longsword).toMatchObject({
      kind: "concrete",
      name: "+1 Longsword",
      source: "DMG",
      page: 213,
      category: "melee weapon",
      rarity: "uncommon",
      weightLb: 3,
      familyKey: "family:+1 weapon|dmg",
      baseKey: "base:longsword|phb",
    });
    expect(longsword.valueCp).toBeUndefined(); // magic items do not inherit the mundane price
    expect(longsword.details).toMatchObject({
      description: "You have a +1 bonus to attack and damage rolls made with this magic longsword.",
      weaponCategory: "martial",
      damage: { dice: "1d8", type: "slashing", versatileDice: "1d10" },
      properties: ["Versatile"],
      bonusWeapon: "+1",
      upstream: { kind: "specific", family: "+1 weapon|dmg", base: "longsword|phb" },
    });
    expect(find(plan, "specific:+1 weapon|xdmg>longsword|xphb").details.mastery).toEqual(["Sap"]);

    // Removals apply before additions: "Plate Armor" - " Armor" + " Barding".
    const barding = find(plan, "specific:barding|phb>plate armor|phb");
    expect(barding).toMatchObject({ name: "Plate Barding", source: "PHB", valueCp: 600000, weightLb: 130, category: "heavy armor" });
    expect(barding.details).toMatchObject({ armorClass: 18, strength: 15, stealthDisadvantage: true });
    expect(barding.details.description).toBe([
      "Barding is armor designed to protect an animal's head, neck, chest, and body.",
      "Plate consists of shaped, interlocking metal plates to cover the entire body.",
    ].join("\n\n"));

    expect(find(plan, "specific:keen +1 weapon|hb>longsword|xphb")).toMatchObject({ name: "Keen +1 Longsword", source: "HB", rarity: "rare" });
    // The family is browsable on its own and takes the category its specifics share.
    expect(find(plan, "family:barding|phb")).toMatchObject({ kind: "family", name: "Barding", category: "heavy armor" });
    expect(find(plan, "family:+1 weapon|dmg").category).toBe("melee weapon");
  });

  test("an item-entry template is filled from the generated item", () => {
    const plan = buildItemImportPlan(itemSources());
    const armor = find(plan, "specific:armor of fire resistance|dmg>plate armor|phb");

    expect(armor).toMatchObject({ name: "Plate Armor of Fire Resistance", requiresAttunement: true, rarity: "rare" });
    expect(armor.details.description).toBe([
      "You have resistance to fire damage while you wear this armor.",
      "Plate consists of shaped, interlocking metal plates to cover the entire body.",
    ].join("\n\n"));
    expect(find(plan, "family:armor of fire resistance|dmg").details.description)
      .toBe("You have resistance to fire damage while you wear this armor.");
  });

  test("group members and pack contents link to catalog identities in upstream order", () => {
    const plan = buildItemImportPlan(itemSources());

    expect(find(plan, "group:armor of resistance|dmg").relations).toEqual([
      { relation: "group_member", position: 0, memberRef: "Armor of Fire Resistance", memberKey: "family:armor of fire resistance|dmg" },
      { relation: "group_member", position: 1, memberRef: "+1 Longsword|XDMG", memberKey: "specific:+1 weapon|xdmg>longsword|xphb" },
      { relation: "group_member", position: 2, memberRef: "Armor of Frost Resistance|DMG" },
    ]);
    expect(plan.unresolved).toContainEqual({ label: "Armor of Resistance|DMG", message: 'Group member "Armor of Frost Resistance|DMG" not found.' });

    expect(find(plan, "named:explorer's pack|hb").relations).toEqual([
      { relation: "pack_content", position: 0, memberRef: "longsword|phb", memberKey: "base:longsword|phb" },
      { relation: "pack_content", position: 1, memberRef: "sling bullet|xphb", memberKey: "base:sling bullet|xphb", quantity: 20 },
    ]);
  });

  test("exact fractions, charge formulas, attunement notes, aliases, attached spells and base links are kept on a named item", () => {
    const plan = buildItemImportPlan(itemSources());

    expect(find(plan, "specific:silvered ammunition|xdmg>sling bullet|xphb").weightLb).toBe(0.075);
    expect(find(plan, "base:sling bullet|xphb")).toMatchObject({ valueCp: 0.2, weightLb: 0.075, category: "ammunition" });

    const blade = find(plan, "named:stonemaker blade|hb");
    expect(blade).toMatchObject({
      requiresAttunement: true,
      attunementNote: "by a dwarf",
      aliases: ["Stonecutter"],
      baseKey: "base:longsword|phb",
    });
    expect(blade.details).toMatchObject({
      charges: "1d6 + 1",
      recharge: "dawn",
      rechargeAmount: "1d6 + 1",
      spells: [{ name: "meld into stone", source: "XPHB" }],
      // Spell and item tags stay links.
      description: "You can cast {@spell Meld into Stone|XPHB} from this {@item longsword|phb|sword}.",
    });
  });

  test("a record the catalog columns cannot hold is rejected alone", () => {
    const trinket = { name: "Overpriced Trinket", source: "HB", rarity: "common", value: 0.00001 };
    const plan = buildItemImportPlan(itemSources({ items: [trinket, fixtureRecords.slumbering] }));

    expect(plan.failures).toEqual([{ label: "Overpriced Trinket|HB", message: expect.stringContaining("Value must be a number") }]);
    expect(plan.records.some(record => record.importKey === "named:slumbering dragon vessel|ftd")).toBe(true);
  });

  test("item descriptions keep nested rules, authored table labels, and long mastery qualifiers", () => {
    const qualifier = "You can use this mastery without counting it against the number of properties you can use.";
    const plan = buildItemImportPlan(itemSources({ items: [{
      name: "Test Weapon", source: "HB", reqAttune: "optional",
      mastery: [{ uid: "Sap|XPHB", note: qualifier }],
      attachedSpells: { will: ["mage hand|xphb"], ability: "int" },
      entries: [
        { type: "list", items: ["Choose a benefit.", { type: "list", items: ["Restore a charge."] }] },
        { type: "table", colLabels: ["Card"], rows: [[{ type: "cell", roll: { exact: 1 }, entry: "Ace" }]] },
      ],
    }] }));
    const item = find(plan, "named:test weapon|hb");
    expect(item).toMatchObject({ requiresAttunement: false, attunementNote: "Optional" });
    expect(item.details.mastery).toEqual(["Sap"]);
    expect(item.details.spells).toEqual([{ name: "mage hand", source: "XPHB" }]);
    expect(item.details.description).toContain("- Restore a charge.");
    expect(item.details.description).toContain("| Ace |");
    expect(item.details.description).toContain(qualifier);
  });

  test("item descriptions keep item and spell references, an unqualified item meaning the DMG printing, but lead-ins and rules fields do not", () => {
    const plan = buildItemImportPlan(itemSources({ items: [{
      name: "Quiver of Plenty", source: "HB", charges: "{@item arrow|phb} count",
      entries: [
        "Holds 20 {@item arrow|phb|arrows}, a {@item potion of healing} and a {@spell light|xphb} scroll.",
        { type: "entries", name: "{@item Bolt|PHB} Pocket", entries: ["Fits {@item crossbow bolt|xphb||bolts}."] },
        { type: "table", colLabels: ["Roll"], rows: [["{@item Longsword|XPHB}"]] },
      ],
    }] }));
    const item = find(plan, "named:quiver of plenty|hb");

    const description = item.details.description ?? "";
    expect(description).toContain("Holds 20 {@item arrow|phb|arrows}, a {@item potion of healing|DMG} and a {@spell light|xphb} scroll.");
    expect(description).toContain("Fits {@item crossbow bolt|xphb}.");
    expect(description).toContain("| {@item Longsword|XPHB} |");
    // A lead-in name is a label: its reference reads as text.
    expect(description).toContain("**Bolt Pocket.**");
    expect(item.details.charges).toBe("arrow count");
    expect(plan.unsupported.filter(issue => issue.message.includes("inline markup"))).toEqual([]);
  });

  test("malformed rows and fractional pack counts fail preflight independently", () => {
    const plan = buildItemImportPlan({
      ...itemSources(),
      items: { item: [
        null,
        { name: "Test Pack", source: "HB", packContents: [{ item: "Longsword|PHB", quantity: 1.5 }] },
        fixtureRecords.slumbering,
      ] },
    });
    expect(plan.counts.input.named).toBe(3);
    expect(plan.failures.map(failure => failure.label)).toEqual(["items.json item[0]", "Test Pack|HB"]);
    expect(plan.records.filter(record => record.upstreamKind === "named").map(record => record.name))
      .toEqual(["Slumbering Dragon Vessel"]);
  });

  test("two builds of the same input produce the same identities and rows", () => {
    expect(buildItemImportPlan(itemSources())).toEqual(buildItemImportPlan(itemSources()));
  });
});
