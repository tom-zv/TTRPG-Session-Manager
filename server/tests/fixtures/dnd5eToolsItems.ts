import type { Dnd5eToolsItemSources } from "../../src/utils/dnd5etools/item-transformer.js";

// Small inputs in the shape of 5etools data/items.json, items-base.json and magicvariants.json.
// Records follow upstream field names and generation rules; text and values are trimmed, and the
// "HB" records are made up to reach edge cases the books do not (cycles, a dangling copy, a bad price).

type Json = Record<string, unknown>;

const longswordPhb: Json = {
  name: "Longsword", source: "PHB", page: 149, edition: "classic", type: "M", rarity: "none",
  weight: 3, value: 1500, weaponCategory: "martial", property: ["V"], dmg1: "1d8", dmgType: "S", dmg2: "1d10",
  weapon: true, sword: true,
};
const longswordXphb: Json = {
  name: "Longsword", source: "XPHB", page: 215, edition: "one", type: "M|XPHB", rarity: "none",
  weight: 3, value: 1500, weaponCategory: "martial", property: ["V|XPHB"], mastery: ["Sap|XPHB"],
  dmg1: "1d8", dmgType: "S", dmg2: "1d10", weapon: true, sword: true,
};
// No edition: third-party base items take every family.
const pitchfork: Json = {
  name: "Pitchfork", source: "HB", page: 12, type: "M", rarity: "none", weight: 5, value: 50,
  weaponCategory: "simple", dmg1: "1d6", dmgType: "P", weapon: true,
};
const netXphb: Json = {
  name: "Net", source: "XPHB", page: 215, edition: "one", type: "R|XPHB", rarity: "none", weight: 3, value: 100,
  weaponCategory: "martial", weapon: true, net: true,
};
const plateArmor: Json = {
  name: "Plate Armor", source: "PHB", page: 145, edition: "classic", type: "HA", rarity: "none",
  weight: 65, value: 150000, ac: 18, strength: "15", stealth: true, armor: true,
  entries: ["Plate consists of shaped, interlocking metal plates to cover the entire body."],
};
const slingBullet: Json = {
  name: "Sling Bullet", source: "XPHB", page: 222, edition: "one", type: "A|XPHB", rarity: "none",
  weight: 0.075, value: 0.2,
};
// A pack: never takes a variant, even when the family's requirement matches.
const slingBullets: Json = {
  name: "Sling Bullets (20)", source: "XPHB", page: 222, edition: "one", type: "A|XPHB", rarity: "none",
  weight: 1.5, value: 4, packContents: [{ item: "sling bullet|xphb", quantity: 20 }],
};

const plusOneWeaponDmg: Json = {
  name: "+1 Weapon", edition: "classic", type: "GV|DMG",
  requires: [{ weapon: true }], excludes: { net: true },
  inherits: {
    namePrefix: "+1 ", source: "DMG", page: 213, rarity: "uncommon", bonusWeapon: "+1",
    entries: ["You have a {=bonusWeapon} bonus to attack and damage rolls made with this magic {=baseName/l}."],
  },
};
const plusOneWeaponXdmg: Json = {
  name: "+1 Weapon", type: "GV|XDMG",
  requires: [{ weapon: true }], excludes: { net: true },
  inherits: {
    namePrefix: "+1 ", source: "XDMG", page: 324, rarity: "uncommon", bonusWeapon: "+1",
    entries: ["You have a {=bonusWeapon} bonus to attack rolls and damage rolls made with this magic weapon."],
  },
};
const armorOfFireResistance: Json = {
  name: "Armor of Fire Resistance", edition: "classic", type: "GV|DMG", requires: [{ armor: true }],
  inherits: {
    nameSuffix: " of Fire Resistance", source: "DMG", page: 152, rarity: "rare", reqAttune: true,
    resist: ["fire"], entries: ["{#itemEntry Armor of Resistance|DMG}"],
  },
};
const barding: Json = {
  name: "Barding", edition: "classic", type: "GV|DMG", requires: [{ armor: true }],
  inherits: {
    nameRemove: " Armor", nameSuffix: " Barding", source: "PHB", page: 155, rarity: "none", barding: true,
    valueExpression: "[[baseItem.value]] * 4", weightExpression: "[[baseItem.weight]] * 2",
    entries: ["Barding is armor designed to protect an animal's head, neck, chest, and body."],
  },
};
const silveredAmmunition: Json = {
  name: "Silvered Ammunition", type: "GV|XDMG", requires: [{ type: "A|XPHB" }],
  inherits: { namePrefix: "Silvered ", source: "XDMG", page: 220, rarity: "none", entries: ["Silver-plated ammunition."] },
};
// A family made by copying another one (magicvariants.json internal copy).
const keenWeapon: Json = {
  name: "Keen +1 Weapon", source: "HB",
  _copy: {
    name: "+1 Weapon", source: "XDMG",
    _mod: {
      "inherits.namePrefix": { mode: "setProp", value: "Keen +1 " },
      "inherits.source": { mode: "setProp", value: "HB" },
      "inherits.rarity": { mode: "setProp", value: "rare" },
    },
  },
  requires: [{ sword: true }],
};

// A copy chain: Wakened copies Stirring, which copies Slumbering.
const slumbering: Json = {
  name: "Slumbering Dragon Vessel", source: "FTD", page: 26, rarity: "uncommon", reqAttune: true, wondrous: true,
  weight: 1, entries: ["This vessel can be a potion bottle, drinking horn, or other container.", "Slumbering. The vessel holds mead."],
};
const stirring: Json = {
  name: "Stirring Dragon Vessel", source: "FTD", rarity: "rare",
  _copy: {
    name: "Slumbering Dragon Vessel", source: "FTD",
    _mod: { entries: { mode: "replaceArr", replace: "Slumbering. The vessel holds mead.", items: "Stirring. The vessel holds wine." } },
    _preserve: { page: true },
  },
};
const wakened: Json = {
  name: "Wakened Dragon Vessel", source: "FTD", rarity: "very rare", weight: null,
  _copy: {
    name: "Stirring Dragon Vessel", source: "FTD",
    _mod: { entries: [{ mode: "appendArr", items: "Wakened. The vessel holds a potion of fire breath." }] },
  },
};

const fixtureBlade: Json = {
  name: "Stonemaker Blade", source: "HB", page: 3, baseItem: "longsword|phb", type: "M", rarity: "very rare",
  reqAttune: "by a dwarf", weight: 3, weaponCategory: "martial", dmg1: "1d8", dmgType: "S", bonusWeapon: "+1",
  charges: "{@dice 1d6 + 1}", recharge: "dawn", rechargeAmount: "{@dice 1d6 + 1}",
  attachedSpells: { charges: { "1": ["meld into stone|xphb"] } }, alias: ["Stonecutter"],
  entries: ["You can cast {@spell Meld into Stone|XPHB} from this {@item longsword|phb|sword}."],
};
const explorersPack: Json = {
  name: "Explorer's Pack", source: "HB", page: 4, type: "G", rarity: "none", weight: 59, value: 1000,
  packContents: ["longsword|phb", { item: "sling bullet|xphb", quantity: 20 }, { special: "10 days of rations" }],
};

export const ARMOR_OF_RESISTANCE_TEMPLATE = "You have resistance to {{item.resist}} damage while you wear this armor.";

export function itemSources(overrides: { items?: Json[]; groups?: Json[]; bases?: Json[]; variants?: Json[] } = {}): Dnd5eToolsItemSources {
  return structuredClone({
    items: {
      item: overrides.items ?? [slumbering, stirring, wakened, fixtureBlade, explorersPack],
      itemGroup: overrides.groups ?? [{
        name: "Armor of Resistance", source: "DMG", page: 152, rarity: "rare", reqAttune: true, type: "GV|DMG",
        items: ["Armor of Fire Resistance", "+1 Longsword|XDMG", "Armor of Frost Resistance|DMG"],
      }],
    },
    base: {
      baseitem: overrides.bases ?? [longswordPhb, longswordXphb, pitchfork, netXphb, plateArmor, slingBullet, slingBullets],
      itemProperty: [
        { abbreviation: "V", source: "PHB", entries: [{ type: "entries", name: "Versatile", entries: ["..."] }] },
        { abbreviation: "V", source: "XPHB", entries: [{ type: "entries", name: "Versatile", entries: ["..."] }] },
      ],
      itemMastery: [{ name: "Sap", source: "XPHB", entries: ["..."] }],
      itemEntry: [{ name: "Armor of Resistance", source: "DMG", entriesTemplate: [ARMOR_OF_RESISTANCE_TEMPLATE] }],
    },
    variants: {
      magicvariant: overrides.variants ?? [plusOneWeaponDmg, plusOneWeaponXdmg, armorOfFireResistance, barding, silveredAmmunition, keenWeapon],
    },
  });
}

export const fixtureRecords = {
  longswordPhb, longswordXphb, pitchfork, plateArmor, slumbering, stirring, wakened, fixtureBlade, explorersPack,
  plusOneWeaponDmg, plusOneWeaponXdmg, armorOfFireResistance, barding, silveredAmmunition, keenWeapon,
};
