import { DnD5eEntityUpdateDB, DnD5eEntitySummaryDB, DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";
import { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";

export function dnd5eEntityToUpdateDb(entity: DnD5eEntityDetails): DnD5eEntityUpdateDB {
  return {
    id: entity.templateId,
    name: entity.name,
    image_url: entity.imageUrl,
    created_at: entity.createdAt,

    role: entity.role,
    creature_type: entity.creatureType,
    type_tags: entity.typeTags,
    cr: entity.cr,
    ac: entity.ac,
    hp: entity.hp,
    hp_formula: entity.hpFormula,
    speeds: entity.speeds,
    size: entity.size,
    alignment: entity.alignment,
    ability_scores: entity.abilityScores,
    saves: entity.saves,
    skills: entity.skills,
    passive_perception: entity.passivePerception,
    senses: entity.senses,
    languages: entity.languages,
    legendary_action_count: entity.legendaryActionCount,
    legendary_header: entity.legendaryHeader,

    resistances: entity.resistances?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })),
    immunities: entity.immunities?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })),
    vulnerabilities: entity.vulnerabilities?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })),
    condition_immunities: entity.conditionImmunities?.map(c => ({ condition_name: c.conditionName, condition_note: c.conditionNote })),

    traits: entity.traits?.map((t, i) => ({ name: t.name, description: t.description, sort_order: t.sortOrder ?? i })),
    actions: entity.actions?.map((a, i) => ({ name: a.name, description: a.description, action_type: a.actionType, sort_order: a.sortOrder ?? i })),
    spellcasting: entity.spellcasting?.map(sc => ({
      name: sc.name,
      display_as: sc.displayAs,
      ability: sc.ability,
      save_dc: sc.saveDc,
      spell_attack_bonus: sc.spellAttackBonus,
      descriptions: sc.descriptions,
      levels: sc.levels?.map(l => ({ level: l.level, slots: l.slots, spells: l.spells })),
      freq_spells: sc.freqSpells,
    })),
  };
}

export function dnd5eEntityDbToDomain(db: DnD5eEntityDB): DnD5eEntityDetails {
  return {
    templateId: db.id,
    name: db.name,
    imageUrl: db.image_url,
    createdAt: db.created_at,

    role: db.role,
    creatureType: db.creature_type,
    typeTags: db.type_tags,
    cr: db.cr,
    ac: db.ac,
    hp: db.hp,
    hpFormula: db.hp_formula,
    speeds: db.speeds,
    size: db.size,
    alignment: db.alignment,
    abilityScores: db.ability_scores,
    saves: db.saves,
    skills: db.skills,
    passivePerception: db.passive_perception,
    senses: db.senses,
    languages: db.languages,
    legendaryActionCount: db.legendary_action_count,
    legendaryHeader: db.legendary_header,

    resistances: db.resistances?.map(r => ({ damageType: r.damage_type, conditionNote: r.condition_note })),
    immunities: db.immunities?.map(r => ({ damageType: r.damage_type, conditionNote: r.condition_note })),
    vulnerabilities: db.vulnerabilities?.map(r => ({ damageType: r.damage_type, conditionNote: r.condition_note })),
    conditionImmunities: db.condition_immunities?.map(c => ({ conditionName: c.condition_name, conditionNote: c.condition_note })),

    traits: db.traits?.map(t => ({ name: t.name, description: t.description, sortOrder: t.sort_order })),
    actions: db.actions?.map(a => ({ name: a.name, description: a.description, actionType: a.action_type, sortOrder: a.sort_order })),
    spellcasting: db.spellcasting?.map(sc => ({
      name: sc.name,
      displayAs: sc.display_as,
      ability: sc.ability,
      saveDc: sc.save_dc,
      spellAttackBonus: sc.spell_attack_bonus,
      descriptions: sc.descriptions,
      levels: sc.levels?.map(l => ({ level: l.level, slots: l.slots, spells: l.spells })),
      freqSpells: sc.freq_spells,
    })),
  };
}

export function dnd5eEntityToInsertDb(entity: DnD5eEntityDetails): Omit<DnD5eEntityDB, 'id'> {
  return {
    name: entity.name,
    image_url: entity.imageUrl,
    created_at: entity.createdAt || new Date().toISOString(),

    role: entity.role,
    creature_type: entity.creatureType,
    type_tags: entity.typeTags,
    cr: entity.cr,
    ac: entity.ac ?? 10,
    hp: entity.hp ?? 1,
    hp_formula: entity.hpFormula,
    speeds: entity.speeds ?? { walk: 30 },
    size: entity.size ?? 'medium',
    alignment: entity.alignment ?? 'unaligned',
    ability_scores: entity.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: entity.saves,
    skills: entity.skills,
    passive_perception: entity.passivePerception,
    senses: entity.senses ?? [],
    languages: entity.languages,
    legendary_action_count: entity.legendaryActionCount,
    legendary_header: entity.legendaryHeader,

    resistances: entity.resistances?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })) ?? [],
    immunities: entity.immunities?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })) ?? [],
    vulnerabilities: entity.vulnerabilities?.map(r => ({ damage_type: r.damageType, condition_note: r.conditionNote })) ?? [],
    condition_immunities: entity.conditionImmunities?.map(c => ({ condition_name: c.conditionName, condition_note: c.conditionNote })) ?? [],

    traits: entity.traits?.map((t, i) => ({ name: t.name, description: t.description, sort_order: t.sortOrder ?? i })) ?? [],
    actions: entity.actions?.map((a, i) => ({ name: a.name, description: a.description, action_type: a.actionType, sort_order: a.sortOrder ?? i })) ?? [],
    spellcasting: entity.spellcasting?.map(sc => ({
      name: sc.name,
      display_as: sc.displayAs,
      ability: sc.ability,
      save_dc: sc.saveDc,
      spell_attack_bonus: sc.spellAttackBonus,
      descriptions: sc.descriptions,
      levels: sc.levels?.map(l => ({ level: l.level, slots: l.slots, spells: l.spells })),
      freq_spells: sc.freqSpells,
    })) ?? [],
  };
}

export function dnd5eEntitySummaryDbToDomain(db: DnD5eEntitySummaryDB): DnD5eEntitySummary {
  return {
    templateId: db.id,
    name: db.name,
    hp: db.hp,
    role: db.role,
    cr: db.cr,
  };
}
