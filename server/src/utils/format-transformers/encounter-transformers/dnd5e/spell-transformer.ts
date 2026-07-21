import type { SpellDB, SpellSummaryDB, SpellTagDB, SpellWriteDB } from "src/api/encounter/spells/types.js";
import type { Spell, SpellAttackKind, SpellInput, SpellSummary } from "shared/domain/dnd5e/spell.js";

const tagValues = (tags: SpellTagDB[], type: SpellTagDB["tag_type"]): string[] =>
  tags.filter(tag => tag.tag_type === type).map(tag => tag.tag);

export function spellDbToSummary(spell: SpellSummaryDB, tags: SpellTagDB[]): SpellSummary {
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

// A validated SpellInput (shared validateSpellInput) -> row + tags. Blank optional text becomes NULL.
export function spellInputToDb(input: SpellInput): { spell: SpellWriteDB; tags: SpellTagDB[] } {
  const optional = (value: string | undefined) => (value?.trim() ? value.trim() : null);
  const spell: SpellWriteDB = {
    name: input.name.trim(),
    source: input.source.trim(),
    page: input.page ?? null,
    level: input.level,
    school: input.school,
    ritual: input.ritual,
    concentration: input.concentration,
    casting_time: input.castingTime.trim(),
    casting_unit: input.castingUnit,
    casting_trigger: optional(input.castingTrigger),
    range_text: input.range.trim(),
    range_feet: input.rangeFeet ?? null,
    comp_v: input.components.v,
    comp_s: input.components.s,
    comp_m: input.components.m,
    material: input.components.m ? optional(input.material) : null,
    material_cost_cp: input.components.m ? input.materialCostCp ?? null : null,
    material_consumed: input.components.m && input.materialConsumed,
    duration: input.duration.trim(),
    description: input.description.trim(),
    higher_levels: optional(input.higherLevels),
  };

  const seen = new Set<string>();
  const tags = ([
    ["class", input.classes],
    ["damage", input.damageTypes.map(tag => tag.toLowerCase())],
    ["save", input.saves.map(tag => tag.toLowerCase())],
    ["condition", input.conditions.map(tag => tag.toLowerCase())],
    ["attack", input.attack ? [input.attack] : []],
    ["alias", input.aliases],
  ] as const).flatMap(([tagType, values]) =>
    values.map(value => ({ tag_type: tagType, tag: value.trim() }))
  ).filter(tag => {
    const key = `${tag.tag_type}|${tag.tag.toLowerCase()}`;
    if (!tag.tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { spell, tags };
}
