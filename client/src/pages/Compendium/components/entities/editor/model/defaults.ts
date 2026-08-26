import type { DnD5eEntityWrite, UpdateEntityRequest } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { DEFAULT_ABILITY_SCORES } from "./calculations.js";

// A loaded snapshot may contain SQL NULLs that PUT accepts, including legacy speeds.
export type EntityDraft = {
  [K in keyof DnD5eEntityWrite]: DnD5eEntityWrite[K] | Extract<UpdateEntityRequest[K], null>;
};

export const createDefaultEntity = (role: DnD5eEntityWrite["role"] = "creature"): DnD5eEntityWrite => ({
  name: "New Entity",
  role,
  ac: 10,
  hp: 1,
  speeds: { walk: 30 },
  size: "medium",
  alignment: "unaligned",
  abilityScores: { ...DEFAULT_ABILITY_SCORES },
  settings: {},
  typeTags: [],
  saves: {},
  skills: {},
  senses: [],
  languages: [],
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  conditionImmunities: [],
  traits: [],
  actions: [],
  spellcasting: [],
  legendaryHeader: [],
});

export const loadEntityDraft = (entity: EntityDraft): EntityDraft => structuredClone({
  name: entity.name,
  imageUrl: entity.imageUrl,
  role: entity.role,
  settings: entity.settings,
  creatureType: entity.creatureType,
  typeTags: entity.typeTags,
  cr: entity.cr,
  ac: entity.ac,
  hp: entity.hp,
  hpFormula: entity.hpFormula,
  speeds: entity.speeds,
  size: entity.size,
  alignment: entity.alignment,
  abilityScores: entity.abilityScores,
  saves: entity.saves,
  skills: entity.skills,
  passivePerception: entity.passivePerception,
  senses: entity.senses,
  languages: entity.languages,
  resistances: entity.resistances,
  immunities: entity.immunities,
  vulnerabilities: entity.vulnerabilities,
  conditionImmunities: entity.conditionImmunities,
  traits: entity.traits,
  actions: entity.actions,
  spellcasting: entity.spellcasting,
  legendaryActionCount: entity.legendaryActionCount,
  legendaryHeader: entity.legendaryHeader,
});

export const duplicateEntity = (entity: EntityDraft): EntityDraft => {
  const draft = loadEntityDraft(entity);
  delete draft.settings;
  return draft;
};
