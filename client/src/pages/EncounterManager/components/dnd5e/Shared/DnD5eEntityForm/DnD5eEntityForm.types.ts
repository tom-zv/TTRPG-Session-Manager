import type {
  DamageModifier,
  DnD5eEntityDetails,
  EntitySpellcasting,
  SpellcastingLevel,
} from "shared/domain/encounters/dnd5e/entity.js";
import type { AbilityKey } from "../DnD5eEntityCard/DnD5eEntityCard.utils.js";

export type EntityFormMode = "create" | "edit";

export type EntityFormSubmitValue = Omit<
  DnD5eEntityDetails,
  "templateId" | "createdAt"
>;

export type AbilityScoresDraft = Record<AbilityKey, string>;

export type SpeedDraft = {
  id: string;
  type: string;
  value: string;
};

export type RecordEntryMode = "proficient" | "expertise" | "custom";

export type RecordOption = {
  value: string;
  label: string;
  ability: AbilityKey;
};

export type RecordEntryDraft = {
  id: string;
  key: string;
  value: string;
  mode: RecordEntryMode;
};

export type DamageModifierDraft = {
  id: string;
  damageType: string;
  conditionNote: string;
};

export type ConditionImmunityDraft = {
  id: string;
  conditionName: string;
  conditionNote: string;
};

export type TextEntryDraft = {
  id: string;
  name: string;
  description: string;
};

export type ActionEntryDraft = TextEntryDraft & {
  actionType: string;
};

export type SpellcastingDraft = {
  id: string;
  name: string;
  displayAs: string;
  ability: string;
  saveDc: string;
  spellAttackBonus: string;
  descriptionsText: string;
  levels?: SpellcastingLevel[];
  freqSpells?: EntitySpellcasting["freqSpells"];
};

export type PassivePerceptionMode = "auto" | "manual";

export type DnD5eEntityFormDraft = {
  name: string;
  imageUrl: string;
  role: DnD5eEntityDetails["role"];
  creatureType: string;
  typeTags: string[];
  cr: string;
  ac: string;
  hp: string;
  hpFormula: string;
  speeds: SpeedDraft[];
  size: DnD5eEntityDetails["size"];
  alignment: string;
  abilityScores: AbilityScoresDraft;
  saves: RecordEntryDraft[];
  skills: RecordEntryDraft[];
  passivePerceptionMode: PassivePerceptionMode;
  passivePerception: string;
  senses: string[];
  languages: string[];
  vulnerabilities: DamageModifierDraft[];
  resistances: DamageModifierDraft[];
  immunities: DamageModifierDraft[];
  conditionImmunities: ConditionImmunityDraft[];
  traits: TextEntryDraft[];
  actions: ActionEntryDraft[];
  spellcasting: SpellcastingDraft[];
  legendaryActionCount: string;
  legendaryHeaderText: string;
};

export type EntityFormValidationResult =
  | { ok: true; entity: EntityFormSubmitValue }
  | { ok: false; errors: string[] };

export type DamageModifierGroup =
  | "vulnerabilities"
  | "resistances"
  | "immunities";

export type DraftListName =
  | "saves"
  | "skills"
  | "vulnerabilities"
  | "resistances"
  | "immunities"
  | "conditionImmunities"
  | "traits"
  | "actions"
  | "spellcasting";

export type DamageModifierInput = Omit<DamageModifier, "conditionNote"> & {
  conditionNote?: string;
};
