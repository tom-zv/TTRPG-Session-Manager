import type {
  ActionEntryDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  FieldErrors,
  OpenSectionId,
  OpenSections,
  ProficiencyRowsView,
  RecordEntryDraft,
  SpellcastingDraft,
  TextEntryDraft,
} from "../DnD5eEntityForm.types.js";

export type AdvancedSectionsProps = {
  draft: DnD5eEntityFormDraft;
  fieldErrors: FieldErrors;
  openSections: OpenSections;
  activeProficiencyRows: ProficiencyRowsView;
  passivePerception: number;
  proficiencyBonus: number;
  sectionCounts: Record<OpenSectionId, number>;
  updateDraft: <Key extends keyof DnD5eEntityFormDraft>(
    key: Key,
    value: DnD5eEntityFormDraft[Key]
  ) => void;
  toggleSection: (id: OpenSectionId) => void;
  setActiveProficiencyRows: (view: ProficiencyRowsView) => void;
  getRowError: (prefix: string, id: string) => string | undefined;
  appendRecordRow: (
    key: "saves" | "skills",
    prefix: "save" | "skill",
    row: Omit<RecordEntryDraft, "id">
  ) => void;
  updateRecordRow: (
    key: "saves" | "skills",
    id: string,
    patch: Partial<RecordEntryDraft>
  ) => void;
  removeRecordRow: (key: "saves" | "skills", id: string) => void;
  appendDamageModifier: (
    key: "vulnerabilities" | "resistances" | "immunities",
    prefix: "vulnerability" | "resistance" | "immunity",
    row: Omit<DamageModifierDraft, "id">
  ) => void;
  updateDamageModifier: (
    key: "vulnerabilities" | "resistances" | "immunities",
    id: string,
    patch: Partial<DamageModifierDraft>
  ) => void;
  removeDamageModifier: (
    key: "vulnerabilities" | "resistances" | "immunities",
    id: string
  ) => void;
  appendConditionImmunity: (row: Omit<ConditionImmunityDraft, "id">) => void;
  updateConditionImmunity: (id: string, patch: Partial<ConditionImmunityDraft>) => void;
  removeConditionImmunity: (id: string) => void;
  addTrait: () => void;
  updateTrait: (id: string, patch: Partial<TextEntryDraft>) => void;
  removeTrait: (id: string) => void;
  addAction: (actionType: string) => void;
  updateAction: (id: string, patch: Partial<ActionEntryDraft>) => void;
  removeAction: (id: string) => void;
  addSpellcasting: () => void;
  updateSpellcasting: (id: string, patch: Partial<SpellcastingDraft>) => void;
  removeSpellcasting: (id: string) => void;
};
