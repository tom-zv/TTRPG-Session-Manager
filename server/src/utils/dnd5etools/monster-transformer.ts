import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";
import type {
  Dnd5eToolsEntityImportPayload,
  Dnd5eToolsMonster,
} from "./types.js";
import {
  normalizeAc,
  normalizeAlignment,
  normalizeCreatureType,
  normalizeCr,
  normalizeHp,
  normalizeImageUrl,
  normalizeLegendaryActionCount,
  normalizeSize,
  normalizeSpeeds,
  normalizeStringArray,
  normalizeStringRecord,
  normalizeTypeTags,
} from "./core-normalizers.js";
import {
  normalizeActions,
  normalizeNamedEntries,
} from "./entry-normalizers.js";
import {
  normalizeConditionImmunities,
  normalizeDamageModifiers,
} from "./modifier-normalizers.js";
import { normalizeSpellcasting } from "./spellcasting-normalizer.js";
import { buildTags } from "./tag-normalizer.js";
import { asArray, asNumber, asString, fitField } from "./primitives.js";

export { parseDnd5eToolsMonsters } from "./monster-parser.js";
export { renderDnd5eToolsText } from "./text-renderer.js";
export type {
  Dnd5eToolsEntityImportPayload,
  Dnd5eToolsMonster,
  EntityTagDB,
} from "./types.js";

export function transformDnd5eToolsMonster(monster: Dnd5eToolsMonster): Dnd5eToolsEntityImportPayload {
  const warnings: string[] = [];
  const source = asString(monster.source);
  const page = asNumber(monster.page);
  const name = fitField(asString(monster.name) ?? "Unnamed Creature", 128, "name", warnings);
  const hp = normalizeHp(monster.hp);
  const legendaryActions = asArray(monster.legendary);

  const entity: Omit<DnD5eEntityDB, "id" | "created_at"> = {
    name,
    image_url: normalizeImageUrl(monster, warnings),
    role: "creature",
    creature_type: normalizeCreatureType(monster.type),
    type_tags: normalizeTypeTags(monster.type),
    cr: normalizeCr(monster.cr),
    ac: normalizeAc(monster.ac),
    hp: hp.average,
    hp_formula: hp.formula,
    speeds: normalizeSpeeds(monster.speed),
    size: normalizeSize(monster.size),
    alignment: normalizeAlignment(monster.alignment),
    ability_scores: {
      str: asNumber(monster.str) ?? 10,
      dex: asNumber(monster.dex) ?? 10,
      con: asNumber(monster.con) ?? 10,
      int: asNumber(monster.int) ?? 10,
      wis: asNumber(monster.wis) ?? 10,
      cha: asNumber(monster.cha) ?? 10,
    },
    saves: normalizeStringRecord(monster.save),
    skills: normalizeStringRecord(monster.skill),
    passive_perception: asNumber(monster.passive),
    senses: normalizeStringArray(monster.senses),
    languages: normalizeStringArray(monster.languages),
    resistances: normalizeDamageModifiers(monster.resist, "resist", warnings),
    immunities: normalizeDamageModifiers(monster.immune, "immune", warnings),
    vulnerabilities: normalizeDamageModifiers(monster.vulnerable, "vulnerable", warnings),
    condition_immunities: normalizeConditionImmunities(monster.conditionImmune, warnings),
    traits: normalizeNamedEntries(monster.trait, "trait", warnings),
    actions: normalizeActions(monster, warnings),
    spellcasting: normalizeSpellcasting(monster.spellcasting, warnings),
    legendary_action_count: normalizeLegendaryActionCount(monster, legendaryActions),
    legendary_header: normalizeStringArray(monster.legendaryHeader),
  };

  return {
    entity,
    tags: buildTags(monster, warnings),
    source,
    page,
    warnings,
  };
}
