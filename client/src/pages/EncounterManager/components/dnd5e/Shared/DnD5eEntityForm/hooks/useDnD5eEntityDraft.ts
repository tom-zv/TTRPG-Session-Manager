import { useMemo, useState } from "react";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { ABILITY_KEYS } from "../../dnd5eUtils.js";
import type {
  ActionEntryDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  EntityFormValidationState,
  FieldErrors,
  OpenSectionId,
  OpenSections,
  ProficiencyRowsView,
  RecordEntryDraft,
  SpeedDraft,
  SpellcastingDraft,
  TextEntryDraft,
} from "../DnD5eEntityForm.types.js";
import {
  getProficiencyBonusForCr,
  calcPassivePerception,
} from "../model/calculations.js";
import { ABILITY_PRESETS } from "../model/options.js";
import {
  createBlankAction,
  createBlankConditionImmunity,
  createBlankDamageModifier,
  createBlankRecordEntry,
  createBlankSpeed,
  createBlankSpellcasting,
  createBlankTrait,
  createEntityDraft,
} from "../model/draftTransforms.js";

const DEFAULT_OPEN_SECTIONS: OpenSections = {
  identity: false,
  proficiencies: false,
  defenses: false,
  entries: false,
  spellcasting: false,
  legendary: false,
};

export const useDnD5eEntityDraft = (
  initialEntity: DnD5eEntityDetails | undefined
) => {
  const [draft, setDraft] = useState<DnD5eEntityFormDraft>(() =>
    createEntityDraft(initialEntity)
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [rowErrors, setRowErrors] = useState<FieldErrors>({});
  const [activeProficiencyRows, setActiveProficiencyRows] =
    useState<ProficiencyRowsView>("saves");
  const [openSections, setOpenSections] = useState<OpenSections>(DEFAULT_OPEN_SECTIONS);

  const wisdomScore = readNumber(draft.abilityScores.wis, 10);
  const passivePerception = useMemo(
    () =>
      draft.passivePerceptionMode === "auto"
        ? calcPassivePerception(wisdomScore)
        : readNumber(draft.passivePerception, calcPassivePerception(wisdomScore)),
    [draft.passivePerception, draft.passivePerceptionMode, wisdomScore]
  );
  const proficiencyBonus = getProficiencyBonusForCr(draft.cr);
  const sectionCounts = {
    identity: countFilled([draft.imageUrl, draft.creatureType, draft.typeTags.join(",")]),
    proficiencies: draft.saves.length + draft.skills.length,
    defenses:
      draft.vulnerabilities.length +
      draft.resistances.length +
      draft.immunities.length +
      draft.conditionImmunities.length,
    entries: draft.traits.length + draft.actions.length,
    spellcasting: draft.spellcasting.length,
    legendary:
      readNumber(draft.legendaryActionCount, 0) > 0 || draft.legendaryHeaderText.trim()
        ? 1
        : 0,
  };

  function clearErrors() {
    setLocalError(null);
    setFieldErrors({});
    setRowErrors({});
  }

  function updateDraft<Key extends keyof DnD5eEntityFormDraft>(
    key: Key,
    value: DnD5eEntityFormDraft[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearErrors();
  }

  function applyValidationState(validation: EntityFormValidationState) {
    setFieldErrors(validation.fieldErrors);
    setRowErrors(validation.rowErrors);
    setLocalError(validation.messages.join("\n"));
    if (validation.sectionsToOpen.length > 0) {
      setOpenSections((current) =>
        validation.sectionsToOpen.reduce<OpenSections>(
          (nextSections, section) => ({ ...nextSections, [section]: true }),
          current
        )
      );
    }
  }

  function toggleSection(id: OpenSectionId) {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  }

  function getRowError(prefix: string, id: string): string | undefined {
    return rowErrors[`${prefix}.${id}`];
  }

  function addSpeed(type: string) {
    const exists = draft.speeds.some((speed) => speed.type.trim().toLowerCase() === type);
    if (exists) return;
    updateDraft("speeds", [...draft.speeds, createBlankSpeed(type)]);
  }

  function updateSpeed(id: string, patch: Partial<SpeedDraft>) {
    updateDraft("speeds", updateRows(draft.speeds, id, patch));
  }

  function removeSpeed(id: string) {
    const nextSpeeds = draft.speeds.filter((speed) => speed.id !== id);
    updateDraft("speeds", nextSpeeds.length > 0 ? nextSpeeds : [createBlankSpeed("walk")]);
  }

  function applyPreset(label: string) {
    const preset = ABILITY_PRESETS.find((item) => item.label === label);
    if (!preset) return;
    updateDraft(
      "abilityScores",
      ABILITY_KEYS.reduce((scores, ability) => {
        scores[ability] = String(preset.scores[ability]);
        return scores;
      }, { ...draft.abilityScores })
    );
  }

  function appendRecordRow(
    key: "saves" | "skills",
    prefix: "save" | "skill",
    row: Omit<RecordEntryDraft, "id">
  ) {
    updateDraft(key, [...draft[key], { ...createBlankRecordEntry(prefix), ...row }]);
  }

  function updateRecordRow(key: "saves" | "skills", id: string, patch: Partial<RecordEntryDraft>) {
    updateDraft(key, updateRows(draft[key], id, patch));
  }

  function removeRecordRow(key: "saves" | "skills", id: string) {
    updateDraft(key, draft[key].filter((row) => row.id !== id));
  }

  function appendDamageModifier(
    key: "vulnerabilities" | "resistances" | "immunities",
    prefix: "vulnerability" | "resistance" | "immunity",
    row: Omit<DamageModifierDraft, "id">
  ) {
    updateDraft(key, [...draft[key], { ...createBlankDamageModifier(prefix), ...row }]);
  }

  function updateDamageModifier(
    key: "vulnerabilities" | "resistances" | "immunities",
    id: string,
    patch: Partial<DamageModifierDraft>
  ) {
    updateDraft(key, updateRows(draft[key], id, patch));
  }

  function removeDamageModifier(key: "vulnerabilities" | "resistances" | "immunities", id: string) {
    updateDraft(key, draft[key].filter((row) => row.id !== id));
  }

  function appendConditionImmunity(row: Omit<ConditionImmunityDraft, "id">) {
    updateDraft("conditionImmunities", [
      ...draft.conditionImmunities,
      { ...createBlankConditionImmunity(), ...row },
    ]);
  }

  function updateConditionImmunity(id: string, patch: Partial<ConditionImmunityDraft>) {
    updateDraft("conditionImmunities", updateRows(draft.conditionImmunities, id, patch));
  }

  function removeConditionImmunity(id: string) {
    updateDraft("conditionImmunities", draft.conditionImmunities.filter((row) => row.id !== id));
  }

  function updateTrait(id: string, patch: Partial<TextEntryDraft>) {
    updateDraft("traits", updateRows(draft.traits, id, patch));
  }

  function removeTrait(id: string) {
    updateDraft("traits", draft.traits.filter((row) => row.id !== id));
  }

  function updateAction(id: string, patch: Partial<ActionEntryDraft>) {
    updateDraft("actions", updateRows(draft.actions, id, patch));
  }

  function removeAction(id: string) {
    updateDraft("actions", draft.actions.filter((row) => row.id !== id));
  }

  function updateSpellcasting(id: string, patch: Partial<SpellcastingDraft>) {
    updateDraft("spellcasting", updateRows(draft.spellcasting, id, patch));
  }

  function removeSpellcasting(id: string) {
    updateDraft("spellcasting", draft.spellcasting.filter((row) => row.id !== id));
  }

  return {
    draft,
    localError,
    fieldErrors,
    activeProficiencyRows,
    openSections,
    passivePerception,
    proficiencyBonus,
    sectionCounts,
    setLocalError,
    setActiveProficiencyRows,
    updateDraft,
    applyValidationState,
    toggleSection,
    getRowError,
    addSpeed,
    updateSpeed,
    removeSpeed,
    applyPreset,
    appendRecordRow,
    updateRecordRow,
    removeRecordRow,
    appendDamageModifier,
    updateDamageModifier,
    removeDamageModifier,
    appendConditionImmunity,
    updateConditionImmunity,
    removeConditionImmunity,
    updateTrait,
    removeTrait,
    updateAction,
    removeAction,
    updateSpellcasting,
    removeSpellcasting,
    addTrait: () => updateDraft("traits", [...draft.traits, createBlankTrait()]),
    addAction: (actionType: string) =>
      updateDraft("actions", [...draft.actions, createBlankAction(actionType)]),
    addSpellcasting: () =>
      updateDraft("spellcasting", [...draft.spellcasting, createBlankSpellcasting()]),
  };
};

const updateRows = <Row extends { id: string }>(
  rows: Row[],
  id: string,
  patch: Partial<Row>
): Row[] => rows.map((row) => (row.id === id ? { ...row, ...patch } : row));

const readNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const countFilled = (values: string[]): number =>
  values.filter((value) => value.trim().length > 0).length;
