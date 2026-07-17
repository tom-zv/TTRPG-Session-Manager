import type { SpellDB, SpellTagDB } from "src/api/encounter/spells/types.js";
import type { Spell, SpellAttackKind, SpellSummary } from "shared/domain/dnd5e/spell.js";

const tagValues = (tags: SpellTagDB[], type: SpellTagDB["tag_type"]): string[] =>
  tags.filter(tag => tag.tag_type === type).map(tag => tag.tag);

export function spellDbToSummary(spell: SpellDB, tags: SpellTagDB[]): SpellSummary {
  return {
    id: spell.id,
    name: spell.name,
    source: spell.source,
    level: spell.level,
    school: spell.school,
    ritual: spell.ritual,
    concentration: spell.concentration,
    castingTime: spell.casting_time,
    castingUnit: spell.casting_unit,
    components: { v: spell.comp_v, s: spell.comp_s, m: spell.comp_m },
    classes: tagValues(tags, "class"),
    damageTypes: tagValues(tags, "damage"),
    saves: tagValues(tags, "save"),
    aliases: tagValues(tags, "alias"),
  };
}

export function spellDbToDomain(spell: SpellDB, tags: SpellTagDB[]): Spell {
  const attacks = tagValues(tags, "attack");
  return {
    ...spellDbToSummary(spell, tags),
    ...(spell.page !== null ? { page: spell.page } : {}),
    ...(spell.casting_trigger ? { castingTrigger: spell.casting_trigger } : {}),
    range: spell.range_text,
    ...(spell.range_feet !== null ? { rangeFeet: spell.range_feet } : {}),
    ...(spell.material ? { material: spell.material } : {}),
    ...(spell.material_cost_cp !== null ? { materialCostCp: spell.material_cost_cp } : {}),
    materialConsumed: spell.material_consumed,
    duration: spell.duration,
    description: spell.description,
    ...(spell.higher_levels ? { higherLevels: spell.higher_levels } : {}),
    conditions: tagValues(tags, "condition"),
    ...(attacks.length > 0 ? { attack: attacks[0] as SpellAttackKind } : {}),
    locallyEdited: spell.locally_edited,
  };
}
