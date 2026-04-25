import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  ABILITY_LABELS,
  calcMod,
} from "../DnD5eEntityCard/DnD5eEntityCard.utils.js";
import {
  CollapsibleSection,
  ComboboxInput,
  Field,
  NumberStepper,
  TagField,
} from "./DnD5eEntityFormControls.js";
import type {
  ActionEntryDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  EntityFormMode,
  EntityFormSubmitValue,
  RecordEntryDraft,
  RecordOption,
  SpeedDraft,
  SpellcastingDraft,
  TextEntryDraft,
} from "./DnD5eEntityForm.types.js";
import {
  ABILITY_PRESETS,
  ALIGNMENT_OPTIONS,
  CREATURE_TYPE_OPTIONS,
  LANGUAGE_PRESETS,
  ROLE_OPTIONS,
  SAVE_OPTIONS,
  SENSE_PRESETS,
  SIZE_OPTIONS,
  SKILL_OPTIONS,
  SPEED_TYPE_OPTIONS,
  buildEntityFromDraft,
  calcPassivePerception,
  createBlankAction,
  createBlankConditionImmunity,
  createBlankDamageModifier,
  createBlankRecordEntry,
  createBlankSpeed,
  createBlankSpellcasting,
  createBlankTrait,
  createEntityDraft,
  getProficiencyBonusForCr,
  getRecordEntryValue,
  toSigned,
} from "./DnD5eEntityForm.utils.js";
import {
  ActionRows,
  ConditionImmunityRows,
  DamageModifierRows,
  EntryRows,
  RecordRows,
  SpellcastingRows,
} from "./DnD5eEntityFormRows.js";
import styles from "./DnD5eEntityForm.module.css";

type DnD5eEntityFormProps = {
  mode: EntityFormMode;
  initialEntity?: DnD5eEntityDetails;
  onSubmit: (entity: EntityFormSubmitValue) => Promise<void> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
};

type OpenSections = Record<string, boolean>;
type FieldErrors = Record<string, string>;
type ProficiencyRowsView = "saves" | "skills";
type ValidationViewState = {
  fieldErrors: FieldErrors;
  rowErrors: FieldErrors;
  sectionsToOpen: string[];
  firstInvalidField?: string;
};

export const DnD5eEntityForm: React.FC<DnD5eEntityFormProps> = ({
  mode,
  initialEntity,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<DnD5eEntityFormDraft>(() =>
    createEntityDraft(initialEntity)
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [rowErrors, setRowErrors] = useState<FieldErrors>({});
  const [activeProficiencyRows, setActiveProficiencyRows] =
    useState<ProficiencyRowsView>("saves");
  const [openSections, setOpenSections] = useState<OpenSections>({
    identity: false,
    proficiencies: false,
    defenses: false,
    entries: false,
    spellcasting: false,
    legendary: false,
  });

  useEffect(() => {
    setDraft(createEntityDraft(initialEntity));
    setLocalError(null);
    setFieldErrors({});
    setRowErrors({});
  }, [initialEntity, mode]);

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

  const toggleSection = (id: string) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };

  const updateDraft = <Key extends keyof DnD5eEntityFormDraft>(
    key: Key,
    value: DnD5eEntityFormDraft[Key]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setLocalError(null);
    setFieldErrors({});
    setRowErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    setFieldErrors({});
    setRowErrors({});

    const validation = validateDraftForDisplay(draft);
    const result = buildEntityFromDraft(draft);
    if (!result.ok) {
      setFieldErrors(validation.fieldErrors);
      setRowErrors(validation.rowErrors);
      if (validation.sectionsToOpen.length > 0) {
        setOpenSections((current) =>
          validation.sectionsToOpen.reduce<OpenSections>(
            (nextSections, section) => ({ ...nextSections, [section]: true }),
            current
          )
        );
      }
      setLocalError(result.errors.join("\n"));
      const invalidProficiencyGroup = getProficiencyRowsView(validation.firstInvalidField);
      if (invalidProficiencyGroup) setActiveProficiencyRows(invalidProficiencyGroup);
      focusInvalidField(validation.firstInvalidField);
      return;
    }

    await onSubmit(result.entity);
  };

  const getRowError = (prefix: string, id: string): string | undefined =>
    rowErrors[`${prefix}.${id}`];

  const focusInvalidField = (fieldName?: string) => {
    if (!fieldName) return;
    window.requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(
        `[data-field="${fieldName}"]`
      );
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return (
    <form ref={formRef} className={styles.entityForm} onSubmit={handleSubmit} noValidate>
      {(localError || error) && (
        <div className={styles.errorBox} role="alert">
          {(localError || error)?.split("\n").map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      <div className={styles.formLayout}>
        <div className={styles.coreColumn}>
      <div className={styles.quickGrid}>
        <Field label="Name" name="name" className={styles.nameField} error={fieldErrors.name}>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => updateDraft("name", event.target.value)}
            autoComplete="off"
            required
          />
        </Field>

        <Field label="Role" name="role" className={styles.shortField}>
          <select
            value={draft.role}
            onChange={(event) =>
              updateDraft("role", event.target.value as DnD5eEntityDetails["role"])
            }
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="HP" name="hp" className={styles.compactField} error={fieldErrors.hp}>
          <NumberStepper
            id="hp"
            name="hp"
            min={1}
            value={draft.hp}
            onChange={(value) => updateDraft("hp", value)}
            required
          />
        </Field>

        <Field label="AC" name="ac" className={styles.compactField} error={fieldErrors.ac}>
          <NumberStepper
            id="ac"
            name="ac"
            min={1}
            value={draft.ac}
            onChange={(value) => updateDraft("ac", value)}
            required
          />
        </Field>

        <Field label="Size" name="size" className={styles.shortField}>
          <select
            value={draft.size}
            onChange={(event) =>
              updateDraft("size", event.target.value as DnD5eEntityDetails["size"])
            }
          >
            {SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="CR" name="cr" className={styles.shortField} controlId="cr">
          <div className={styles.crControl}>
            <input
              id="cr"
              name="cr"
              type="text"
              value={draft.cr}
              onChange={(event) => updateDraft("cr", event.target.value)}
              placeholder="1/4"
            />
            <span className={styles.pbBadge}>PB {toSigned(proficiencyBonus)}</span>
          </div>
        </Field>
      </div>

      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <h3>Speed</h3>
          <div className={styles.presetRow}>
            {["walk", "climb", "swim", "fly"].map((speedType) => (
              <button
                key={speedType}
                type="button"
                className={`${styles.presetButton} ${styles.plusButton}`}
                onClick={() => addSpeed(speedType)}
              >
                <FiPlus aria-hidden="true" />
                {speedType}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.rowList}>
          {draft.speeds.map((speed) => {
            const speedError = fieldErrors[`speeds.${speed.id}`];

            return (
              <div key={speed.id} className={styles.rowItem}>
                <div className={`${styles.inlineRow} ${styles.speedRow}`}>
                  <ComboboxInput
                    id={`speed-${speed.id}-type`}
                    name={`speed-${speed.id}-type`}
                    options={SPEED_TYPE_OPTIONS}
                    value={speed.type}
                    onChange={(value) => updateSpeed(speed.id, { type: value })}
                    aria-invalid={Boolean(speedError) || undefined}
                    aria-describedby={speedError ? `speed-${speed.id}-error` : undefined}
                    aria-label="Speed type"
                    className={styles.shortControl}
                    inputClassName={speedError ? styles.inputError : undefined}
                    data-field={`speeds.${speed.id}`}
                    clearLabel="Clear speed type"
                  />
                  <NumberStepper
                    id={`speed-${speed.id}-value`}
                    name={`speed-${speed.id}-value`}
                    min={0}
                    value={speed.value}
                    onChange={(value) => updateSpeed(speed.id, { value })}
                    aria-invalid={Boolean(speedError) || undefined}
                    aria-describedby={speedError ? `speed-${speed.id}-error` : undefined}
                    aria-label="Speed feet"
                    className={styles.compactControl}
                    inputClassName={speedError ? styles.inputError : undefined}
                    data-field={`speeds.${speed.id}`}
                  />
                  <span className={styles.unit}>ft</span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => removeSpeed(speed.id)}
                    aria-label="Remove speed"
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                </div>
                {speedError && (
                  <div id={`speed-${speed.id}-error`} className={styles.rowError}>
                    {speedError}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <h3>Ability Scores</h3>
          <div className={styles.presetRow}>
            {ABILITY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`${styles.presetButton} ${styles.plusButton}`}
                onClick={() => applyPreset(preset.label)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.abilityGrid}>
          {ABILITY_KEYS.map((ability) => {
            const score = readNumber(draft.abilityScores[ability], 10);
            return (
              <label key={ability} className={styles.abilityField}>
                <span>{ABILITY_LABELS[ability]}</span>
                <NumberStepper
                  id={`ability-${ability}`}
                  name={`ability-${ability}`}
                  min={1}
                  value={draft.abilityScores[ability]}
                  onChange={(value) =>
                    updateDraft("abilityScores", {
                      ...draft.abilityScores,
                      [ability]: value,
                    })
                  }
                  aria-invalid={Boolean(fieldErrors[`abilityScores.${ability}`]) || undefined}
                  aria-describedby={
                    fieldErrors[`abilityScores.${ability}`]
                      ? `ability-${ability}-error`
                      : undefined
                  }
                  aria-label={ABILITY_FULL_NAMES[ability]}
                  inputClassName={
                    fieldErrors[`abilityScores.${ability}`] ? styles.inputError : undefined
                  }
                  data-field={`abilityScores.${ability}`}
                />
                <strong>{toSigned(calcMod(score))}</strong>
                {fieldErrors[`abilityScores.${ability}`] && (
                  <div id={`ability-${ability}-error`} className={styles.fieldError}>
                    {fieldErrors[`abilityScores.${ability}`]}
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <h3>Senses & Languages</h3>
        </div>
        <div className={styles.gridTwo}>
          <TagField
            label="Senses"
            name="senses"
            items={draft.senses}
            onChange={(items) => updateDraft("senses", items)}
            placeholder="darkvision 60 ft."
            presets={SENSE_PRESETS}
          />
          <TagField
            label="Languages"
            name="languages"
            items={draft.languages}
            onChange={(items) => updateDraft("languages", items)}
            placeholder="Common"
            presets={LANGUAGE_PRESETS}
          />
        </div>
      </div>
        </div>

        <div className={styles.advancedColumn}>

      <CollapsibleSection
        id="identity"
        title="Identity"
        count={sectionCounts.identity}
        isOpen={openSections.identity}
        onToggle={toggleSection}
      >
        <div className={styles.gridTwo}>
          <Field label="Image URL" name="imageUrl" className={styles.wideField}>
            <input
              type="url"
              value={draft.imageUrl}
              onChange={(event) => updateDraft("imageUrl", event.target.value)}
            />
          </Field>
          <Field label="Creature Type" name="creatureType" className={styles.mediumField}>
            <ComboboxInput
              id="creature-type"
              name="creature-type"
              options={CREATURE_TYPE_OPTIONS}
              value={draft.creatureType}
              onChange={(value) => updateDraft("creatureType", value)}
              clearLabel="Clear creature type"
            />
          </Field>
          <Field label="Alignment" name="alignment" className={styles.mediumField}>
            <ComboboxInput
              id="alignment"
              name="alignment"
              options={ALIGNMENT_OPTIONS}
              value={draft.alignment}
              onChange={(value) => updateDraft("alignment", value)}
              clearLabel="Clear alignment"
            />
          </Field>
          <Field label="HP Formula" name="hpFormula" className={styles.shortField}>
            <input
              type="text"
              value={draft.hpFormula}
              onChange={(event) => updateDraft("hpFormula", event.target.value)}
              placeholder="6d10 + 12"
            />
          </Field>
        </div>
        <TagField
          label="Type Tags"
          name="typeTags"
          items={draft.typeTags}
          onChange={(items) => updateDraft("typeTags", items)}
          placeholder="shapechanger"
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="proficiencies"
        title="Proficiencies"
        count={sectionCounts.proficiencies}
        isOpen={openSections.proficiencies}
        onToggle={toggleSection}
      >
        <div className={styles.recordTabs} role="tablist" aria-label="Proficiency rows">
          <button
            type="button"
            className={`${styles.recordTab}${activeProficiencyRows === "saves" ? " " + styles.recordTabActive : ""}`}
            onClick={() => setActiveProficiencyRows("saves")}
            role="tab"
            aria-selected={activeProficiencyRows === "saves"}
            aria-controls="saving-throws-panel"
          >
            Saving Throws
            {draft.saves.length > 0 && <span>{draft.saves.length}</span>}
          </button>
          <button
            type="button"
            className={`${styles.recordTab}${activeProficiencyRows === "skills" ? " " + styles.recordTabActive : ""}`}
            onClick={() => setActiveProficiencyRows("skills")}
            role="tab"
            aria-selected={activeProficiencyRows === "skills"}
            aria-controls="skills-panel"
          >
            Skills
            {draft.skills.length > 0 && <span>{draft.skills.length}</span>}
          </button>
        </div>

        <div
          id={activeProficiencyRows === "saves" ? "saving-throws-panel" : "skills-panel"}
          role="tabpanel"
        >
          {activeProficiencyRows === "saves" ? (
            <RecordRows
              title="Saving Throws"
              fieldPrefix="saves"
              rows={draft.saves}
              options={SAVE_OPTIONS}
              abilityScores={draft.abilityScores}
              proficiencyBonus={proficiencyBonus}
              addLabel="Save"
              onAdd={(row) => appendRecordRow("saves", "save", row)}
              onUpdate={(id, patch) => updateRecordRow("saves", id, patch)}
              onRemove={(id) => removeRecordRow("saves", id)}
              getError={(id) => getRowError("saves", id)}
            />
          ) : (
            <RecordRows
              title="Skills"
              fieldPrefix="skills"
              rows={draft.skills}
              options={SKILL_OPTIONS}
              abilityScores={draft.abilityScores}
              proficiencyBonus={proficiencyBonus}
              addLabel="Skill"
              onAdd={(row) => appendRecordRow("skills", "skill", row)}
              onUpdate={(id, patch) => updateRecordRow("skills", id, patch)}
              onRemove={(id) => removeRecordRow("skills", id)}
              getError={(id) => getRowError("skills", id)}
            />
          )}
        </div>

        <div className={styles.gridTwo}>
          <Field
            label="Passive Perception"
            name="passivePerception"
            error={fieldErrors.passivePerception}
          >
            <div className={styles.inlineControl}>
              <select
                id="passive-perception-mode"
                name="passive-perception-mode"
                value={draft.passivePerceptionMode}
                onChange={(event) =>
                  updateDraft(
                    "passivePerceptionMode",
                    event.target.value as DnD5eEntityFormDraft["passivePerceptionMode"]
                  )
                }
                className={styles.shortControl}
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
              <NumberStepper
                id="passive-perception"
                name="passive-perception"
                min={1}
                value={
                  draft.passivePerceptionMode === "auto"
                    ? String(passivePerception)
                    : draft.passivePerception
                }
                disabled={draft.passivePerceptionMode === "auto"}
                onChange={(value) => updateDraft("passivePerception", value)}
                aria-invalid={Boolean(fieldErrors.passivePerception) || undefined}
                className={styles.compactControl}
                inputClassName={fieldErrors.passivePerception ? styles.inputError : undefined}
                data-field="passivePerception"
              />
            </div>
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="defenses"
        title="Defenses"
        count={sectionCounts.defenses}
        isOpen={openSections.defenses}
        onToggle={toggleSection}
      >
        <div className={styles.gridThree}>
          <DamageModifierRows
            title="Vulnerabilities"
            fieldPrefix="vulnerabilities"
            rows={draft.vulnerabilities}
            onAdd={(row) => appendDamageModifier("vulnerabilities", "vulnerability", row)}
            onUpdate={(id, patch) => updateDamageModifier("vulnerabilities", id, patch)}
            onRemove={(id) => removeDamageModifier("vulnerabilities", id)}
            getError={(id) => getRowError("vulnerabilities", id)}
          />
          <DamageModifierRows
            title="Resistances"
            fieldPrefix="resistances"
            rows={draft.resistances}
            onAdd={(row) => appendDamageModifier("resistances", "resistance", row)}
            onUpdate={(id, patch) => updateDamageModifier("resistances", id, patch)}
            onRemove={(id) => removeDamageModifier("resistances", id)}
            getError={(id) => getRowError("resistances", id)}
          />
          <DamageModifierRows
            title="Immunities"
            fieldPrefix="immunities"
            rows={draft.immunities}
            onAdd={(row) => appendDamageModifier("immunities", "immunity", row)}
            onUpdate={(id, patch) => updateDamageModifier("immunities", id, patch)}
            onRemove={(id) => removeDamageModifier("immunities", id)}
            getError={(id) => getRowError("immunities", id)}
          />
        </div>
        <ConditionImmunityRows
          rows={draft.conditionImmunities}
          onAdd={appendConditionImmunity}
          onUpdate={updateConditionImmunity}
          onRemove={removeConditionImmunity}
          getError={(id) => getRowError("conditionImmunities", id)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="entries"
        title="Traits And Actions"
        count={sectionCounts.entries}
        isOpen={openSections.entries}
        onToggle={toggleSection}
      >
        <EntryRows
          title="Traits"
          fieldPrefix="traits"
          rows={draft.traits}
          onAdd={() => updateDraft("traits", [...draft.traits, createBlankTrait()])}
          onUpdate={updateTrait}
          onRemove={removeTrait}
          getError={(id) => getRowError("traits", id)}
        />
        <ActionRows
          rows={draft.actions}
          onAdd={(actionType) =>
            updateDraft("actions", [...draft.actions, createBlankAction(actionType)])
          }
          onUpdate={updateAction}
          onRemove={removeAction}
          getError={(id) => getRowError("actions", id)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="spellcasting"
        title="Spellcasting"
        count={sectionCounts.spellcasting}
        isOpen={openSections.spellcasting}
        onToggle={toggleSection}
      >
        <SpellcastingRows
          rows={draft.spellcasting}
          abilityScores={draft.abilityScores}
          proficiencyBonus={proficiencyBonus}
          onAdd={() =>
            updateDraft("spellcasting", [...draft.spellcasting, createBlankSpellcasting()])
          }
          onUpdate={updateSpellcasting}
          onRemove={removeSpellcasting}
          getError={(id) => getRowError("spellcasting", id)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="legendary"
        title="Legendary"
        count={sectionCounts.legendary}
        isOpen={openSections.legendary}
        onToggle={toggleSection}
      >
        <div className={styles.gridTwo}>
          <Field
            label="Legendary Actions"
            name="legendaryActionCount"
            error={fieldErrors.legendaryActionCount}
          >
            <NumberStepper
              id="legendary-action-count"
              name="legendary-action-count"
              min={0}
              value={draft.legendaryActionCount}
              onChange={(value) => updateDraft("legendaryActionCount", value)}
            />
          </Field>
          <Field label="Legendary Header" name="legendaryHeaderText">
            <textarea
              rows={4}
              value={draft.legendaryHeaderText}
              onChange={(event) => updateDraft("legendaryHeaderText", event.target.value)}
            />
          </Field>
        </div>
      </CollapsibleSection>
        </div>
      </div>

      <div className={styles.formActions}>
        {onCancel && (
          <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
          <FiSave aria-hidden="true" />
          {isSubmitting ? "Saving..." : mode === "create" ? "Create Entity" : "Save Entity"}
        </button>
      </div>
    </form>
  );

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

  function updateRecordRow(
    key: "saves" | "skills",
    id: string,
    patch: Partial<RecordEntryDraft>
  ) {
    updateDraft(key, updateRows(draft[key], id, patch));
  }

  function removeRecordRow(key: "saves" | "skills", id: string) {
    updateDraft(
      key,
      draft[key].filter((row) => row.id !== id)
    );
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

  function removeDamageModifier(
    key: "vulnerabilities" | "resistances" | "immunities",
    id: string
  ) {
    updateDraft(
      key,
      draft[key].filter((row) => row.id !== id)
    );
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
    updateDraft(
      "conditionImmunities",
      draft.conditionImmunities.filter((row) => row.id !== id)
    );
  }

  function updateTrait(id: string, patch: Partial<TextEntryDraft>) {
    updateDraft("traits", updateRows(draft.traits, id, patch));
  }

  function removeTrait(id: string) {
    updateDraft(
      "traits",
      draft.traits.filter((row) => row.id !== id)
    );
  }

  function updateAction(id: string, patch: Partial<ActionEntryDraft>) {
    updateDraft("actions", updateRows(draft.actions, id, patch));
  }

  function removeAction(id: string) {
    updateDraft(
      "actions",
      draft.actions.filter((row) => row.id !== id)
    );
  }

  function updateSpellcasting(id: string, patch: Partial<SpellcastingDraft>) {
    updateDraft("spellcasting", updateRows(draft.spellcasting, id, patch));
  }

  function removeSpellcasting(id: string) {
    updateDraft(
      "spellcasting",
      draft.spellcasting.filter((row) => row.id !== id)
    );
  }
};

const updateRows = <Row extends { id: string }>(
  rows: Row[],
  id: string,
  patch: Partial<Row>
): Row[] =>
  rows.map((row) => (row.id === id ? { ...row, ...patch } : row));

const readNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getProficiencyRowsView = (fieldName?: string): ProficiencyRowsView | undefined => {
  if (fieldName?.startsWith("saves.")) return "saves";
  if (fieldName?.startsWith("skills.")) return "skills";
  return undefined;
};

const countFilled = (values: string[]): number =>
  values.filter((value) => value.trim().length > 0).length;

const validateDraftForDisplay = (
  draft: DnD5eEntityFormDraft
): ValidationViewState => {
  const fieldErrors: FieldErrors = {};
  const rowErrors: FieldErrors = {};
  const sectionsToOpen = new Set<string>();
  const proficiencyBonus = getProficiencyBonusForCr(draft.cr);
  let firstInvalidField: string | undefined;

  const markField = (field: string, message: string, section?: string) => {
    fieldErrors[field] = message;
    firstInvalidField ??= field;
    if (section) sectionsToOpen.add(section);
  };

  const markRow = (
    group: string,
    id: string,
    message: string,
    section: string
  ) => {
    const field = `${group}.${id}`;
    rowErrors[field] = message;
    firstInvalidField ??= field;
    sectionsToOpen.add(section);
  };

  if (!draft.name.trim()) {
    markField("name", "Name is required.");
  }

  validateRequiredWholeNumber(draft.hp, "HP must be a whole number of at least 1.", 1, () =>
    markField("hp", "HP must be a whole number of at least 1.")
  );
  validateRequiredWholeNumber(draft.ac, "AC must be a whole number of at least 1.", 1, () =>
    markField("ac", "AC must be a whole number of at least 1.")
  );

  for (const ability of ABILITY_KEYS) {
    validateRequiredWholeNumber(
      draft.abilityScores[ability],
      `${ability.toUpperCase()} must be a whole number of at least 1.`,
      1,
      (message) => markField(`abilityScores.${ability}`, message)
    );
  }

  for (const speed of draft.speeds) {
    const hasAnyValue = speed.type.trim() || speed.value.trim();
    if (!hasAnyValue) continue;

    if (!speed.type.trim()) {
      markField(`speeds.${speed.id}`, "Each speed needs a movement type.");
      continue;
    }

    validateRequiredWholeNumber(
      speed.value,
      `${speed.type.trim()} speed must be a whole number of at least 0.`,
      0,
      (message) => markField(`speeds.${speed.id}`, message)
    );
  }

  if (draft.passivePerceptionMode === "manual") {
    validateOptionalWholeNumber(
      draft.passivePerception,
      "Passive Perception must be a whole number of at least 1.",
      1,
      (message) => markField("passivePerception", message, "proficiencies")
    );
  }

  validateRecordRows(
    draft.saves,
    "saves",
    SAVE_OPTIONS,
    "Saving throw rows need both a name and a value."
  );
  validateRecordRows(
    draft.skills,
    "skills",
    SKILL_OPTIONS,
    "Skill rows need both a name and a value."
  );
  validateDamageRows(draft.vulnerabilities, "vulnerabilities", "Vulnerability rows need a damage type.");
  validateDamageRows(draft.resistances, "resistances", "Resistance rows need a damage type.");
  validateDamageRows(draft.immunities, "immunities", "Immunity rows need a damage type.");

  for (const row of draft.conditionImmunities) {
    const hasAnyValue = row.conditionName.trim() || row.conditionNote.trim();
    if (hasAnyValue && !row.conditionName.trim()) {
      markRow(
        "conditionImmunities",
        row.id,
        "Condition immunity rows need a condition.",
        "defenses"
      );
    }
  }

  validateTextRows(draft.traits, "traits", "Trait rows need both a name and description.");
  validateTextRows(draft.actions, "actions", "Action rows need both a name and description.");

  for (const row of draft.spellcasting) {
    const descriptions = row.descriptionsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const hasAnyValue =
      row.name.trim() ||
      row.displayAs.trim() ||
      row.ability.trim() ||
      row.saveDc.trim() ||
      row.spellAttackBonus.trim() ||
      descriptions.length > 0 ||
      Boolean(row.levels?.length) ||
      Boolean(row.freqSpells && Object.keys(row.freqSpells).length > 0);

    if (hasAnyValue && !row.name.trim()) {
      markRow("spellcasting", row.id, "Spellcasting rows need a name.", "spellcasting");
      continue;
    }

    validateOptionalWholeNumber(
      row.saveDc,
      "Spell save DC must be a whole number of at least 0.",
      0,
      (message) => markRow("spellcasting", row.id, message, "spellcasting")
    );
    validateOptionalWholeNumber(
      row.spellAttackBonus,
      "Spell attack bonus must be a whole number.",
      undefined,
      (message) => markRow("spellcasting", row.id, message, "spellcasting")
    );
  }

  validateOptionalWholeNumber(
    draft.legendaryActionCount,
    "Legendary action count must be a whole number of at least 0.",
    0,
    (message) => markField("legendaryActionCount", message, "legendary")
  );

  return {
    fieldErrors,
    rowErrors,
    sectionsToOpen: Array.from(sectionsToOpen),
    firstInvalidField,
  };

  function validateRecordRows(
    rows: RecordEntryDraft[],
    group: "saves" | "skills",
    options: readonly RecordOption[],
    message: string
  ) {
    for (const row of rows) {
      const value = getRecordEntryValue(row, options, draft.abilityScores, proficiencyBonus);
      const hasAnyValue = row.key.trim() || value.trim();
      if (hasAnyValue && (!row.key.trim() || !value.trim())) {
        markRow(group, row.id, message, "proficiencies");
      }
    }
  }

  function validateDamageRows(
    rows: DamageModifierDraft[],
    group: "vulnerabilities" | "resistances" | "immunities",
    message: string
  ) {
    for (const row of rows) {
      const hasAnyValue = row.damageType.trim() || row.conditionNote.trim();
      if (hasAnyValue && !row.damageType.trim()) {
        markRow(group, row.id, message, "defenses");
      }
    }
  }

  function validateTextRows(
    rows: Array<TextEntryDraft | ActionEntryDraft>,
    group: "traits" | "actions",
    message: string
  ) {
    for (const row of rows) {
      const hasAnyValue = row.name.trim() || row.description.trim();
      if (hasAnyValue && (!row.name.trim() || !row.description.trim())) {
        markRow(group, row.id, message, "entries");
      }
    }
  }
};

const validateRequiredWholeNumber = (
  value: string,
  message: string,
  min: number,
  onError: (message: string) => void
) => {
  const parsed = Number(value.trim());
  if (!value.trim() || !Number.isInteger(parsed) || parsed < min) {
    onError(message);
  }
};

const validateOptionalWholeNumber = (
  value: string,
  message: string,
  min: number | undefined,
  onError: (message: string) => void
) => {
  if (!value.trim()) return;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || (min != null && parsed < min)) {
    onError(message);
  }
};

export default DnD5eEntityForm;
