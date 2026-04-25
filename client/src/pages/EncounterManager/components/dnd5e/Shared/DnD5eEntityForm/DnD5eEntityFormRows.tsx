import React, { useEffect, useRef, useState } from "react";
import { FiCheck, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import {
  ACTION_TYPE_OPTIONS,
  CONDITION_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  getRecordDefaultValue,
  getRecordEntryValue,
  getRecordOption,
  getSpellAttackBonus,
  getSpellSaveDc,
  SPELLCASTING_ABILITY_OPTIONS,
  SPELLCASTING_DISPLAY_OPTIONS,
} from "./DnD5eEntityForm.utils.js";
import { ComboboxInput, Field, NumberStepper } from "./DnD5eEntityFormControls.js";
import type {
  ActionEntryDraft,
  AbilityScoresDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  RecordEntryDraft,
  RecordEntryMode,
  RecordOption,
  SpellcastingDraft,
  TextEntryDraft,
} from "./DnD5eEntityForm.types.js";
import { titleCase } from "../DnD5eEntityCard/DnD5eEntityCard.utils.js";
import styles from "./DnD5eEntityForm.module.css";

const PROFICIENCY_MODE_OPTIONS: Array<{ value: RecordEntryMode; label: string }> = [
  { value: "proficient", label: "Prof" },
  { value: "expertise", label: "Expert" },
  { value: "custom", label: "Custom" },
];

type RecordRowsProps = {
  title: string;
  fieldPrefix: string;
  rows: RecordEntryDraft[];
  options: readonly RecordOption[];
  abilityScores: AbilityScoresDraft;
  proficiencyBonus: number;
  addLabel: string;
  onAdd: (row: Omit<RecordEntryDraft, "id">) => void;
  onUpdate: (id: string, patch: Partial<RecordEntryDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const RecordRows: React.FC<RecordRowsProps> = ({
  title,
  fieldPrefix,
  rows,
  options,
  abilityScores,
  proficiencyBonus,
  addLabel,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState<Omit<RecordEntryDraft, "id">>({
    key: "",
    value: "",
    mode: "proficient",
  });
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (isComposing) firstInputRef.current?.focus();
  }, [isComposing]);

  const openComposer = () => {
    setIsComposing(true);
    setDraftError(null);
  };

  const cancelComposer = () => {
    setDraft({ key: "", value: "", mode: "proficient" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const commitComposer = () => {
    const key = draft.key.trim();
    const value = getDisplayedRecordValue(draft).trim();
    if (!key || !value) {
      setDraftError(`${title} rows need both a name and a value.`);
      return;
    }

    onAdd({ key, value, mode: draft.mode });
    setDraft({ key: "", value: "", mode: "proficient" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter") {
      if (target.tagName !== "INPUT") return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      commitComposer();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      cancelComposer();
    }
  };

  const removeRow = (id: string) => {
    onRemove(id);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const getDisplayedRecordValue = (row: Pick<RecordEntryDraft, "key" | "mode" | "value">) =>
    getRecordEntryValue(row, options, abilityScores, proficiencyBonus);

  const updateDraftKey = (key: string) => {
    setDraft((current) => ({
      ...current,
      key,
      value:
        current.mode === "custom"
          ? getRecordDefaultValue(key, options, abilityScores, proficiencyBonus)
          : current.value,
    }));
    setDraftError(null);
  };

  const updateDraftMode = (mode: RecordEntryMode) => {
    setDraft((current) => ({
      ...current,
      mode,
      value:
        mode === "custom"
          ? getRecordEntryValue(current, options, abilityScores, proficiencyBonus)
          : current.value,
    }));
    setDraftError(null);
  };

  const updateRowKey = (row: RecordEntryDraft, key: string) => {
    onUpdate(row.id, {
      key,
      value:
        row.mode === "custom"
          ? getRecordDefaultValue(key, options, abilityScores, proficiencyBonus)
          : row.value,
    });
  };

  const updateRowMode = (row: RecordEntryDraft, mode: RecordEntryMode) => {
    onUpdate(row.id, {
      mode,
      value:
        mode === "custom"
          ? getRecordEntryValue(row, options, abilityScores, proficiencyBonus)
          : row.value,
    });
  };

  return (
    <div className={styles.rowGroup}>
      <div className={styles.rowGroupHeader}>
        <h4>{title}</h4>
        <button
          ref={addButtonRef}
          type="button"
          className={`${styles.toolButton} ${styles.plusButton}`}
          onClick={openComposer}
          aria-expanded={isComposing}
        >
          <FiPlus aria-hidden="true" />
          {addLabel}
        </button>
      </div>
      <div className={styles.rowList}>
        {isComposing && (
          <div className={`${styles.compactComposer} ${styles.recordRow}`}>
            <select
              ref={firstInputRef}
              id={`${fieldPrefix}-composer-name`}
              name={`${fieldPrefix}-composer-name`}
              value={draft.key}
              onChange={(event) => updateDraftKey(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              aria-label={`${title} name`}
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? `${fieldPrefix}-composer-error` : undefined}
            >
              <option value="">Select {addLabel.toLowerCase()}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              id={`${fieldPrefix}-composer-mode`}
              name={`${fieldPrefix}-composer-mode`}
              value={draft.mode}
              onChange={(event) => updateDraftMode(event.target.value as RecordEntryMode)}
              onKeyDown={handleComposerKeyDown}
              aria-label={`${title} mode`}
            >
              {PROFICIENCY_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <NumberStepper
              id={`${fieldPrefix}-composer-value`}
              name={`${fieldPrefix}-composer-value`}
              value={getDisplayedRecordValue(draft)}
              onChange={(value) => {
                setDraft((current) => ({ ...current, value }));
                setDraftError(null);
              }}
              onKeyDown={handleComposerKeyDown}
              disabled={draft.mode !== "custom"}
              format="signed"
              placeholder="+3"
              aria-label={`${title} value`}
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? `${fieldPrefix}-composer-error` : undefined}
              inputClassName={draftError ? styles.inputError : undefined}
            />
            <div className={styles.composerActions}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.confirmButton}`}
                onClick={commitComposer}
                aria-label={`Add ${title}`}
              >
                <FiCheck aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={cancelComposer}
                aria-label={`Cancel ${title}`}
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            {draftError && (
              <div id={`${fieldPrefix}-composer-error`} className={styles.rowError}>
                {draftError}
              </div>
            )}
          </div>
        )}
        {rows.map((row) => {
          const error = getError?.(row.id);
          const errorId = `${fieldPrefix}-${row.id}-error`;
          const fieldKey = `${fieldPrefix}.${row.id}`;
          const optionRows = ensureCurrentOption(options, row.key);
          const displayedValue = getDisplayedRecordValue(row);

          return (
            <div key={row.id} className={styles.rowItem}>
              <div className={`${styles.inlineRow} ${styles.recordRow}`}>
                <select
                  id={`${fieldPrefix}-${row.id}-name`}
                  name={`${fieldPrefix}-${row.id}-name`}
                  value={row.key}
                  onChange={(event) => updateRowKey(row, event.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  aria-label={`${title} name`}
                  className={error ? styles.inputError : undefined}
                  data-field={fieldKey}
                >
                  <option value="">Select {addLabel.toLowerCase()}</option>
                  {optionRows.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  id={`${fieldPrefix}-${row.id}-mode`}
                  name={`${fieldPrefix}-${row.id}-mode`}
                  value={row.mode}
                  onChange={(event) => updateRowMode(row, event.target.value as RecordEntryMode)}
                  aria-label={`${title} mode`}
                >
                  {PROFICIENCY_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <NumberStepper
                  id={`${fieldPrefix}-${row.id}-value`}
                  name={`${fieldPrefix}-${row.id}-value`}
                  value={displayedValue}
                  onChange={(value) => onUpdate(row.id, { value })}
                  disabled={row.mode !== "custom"}
                  format="signed"
                  placeholder="+3"
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  aria-label={`${title} value`}
                  inputClassName={error ? styles.inputError : undefined}
                  data-field={fieldKey}
                />
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.dangerButton}`}
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove ${title}`}
                >
                  <FiTrash2 aria-hidden="true" />
                </button>
              </div>
              {error && (
                <div id={errorId} className={styles.rowError}>
                  {error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type DamageModifierRowsProps = {
  title: string;
  fieldPrefix: string;
  rows: DamageModifierDraft[];
  onAdd: (row: Omit<DamageModifierDraft, "id">) => void;
  onUpdate: (id: string, patch: Partial<DamageModifierDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const DamageModifierRows: React.FC<DamageModifierRowsProps> = ({
  title,
  fieldPrefix,
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState({ damageType: "", conditionNote: "" });
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (isComposing) firstInputRef.current?.focus();
  }, [isComposing]);

  const openComposer = () => {
    setIsComposing(true);
    setDraftError(null);
  };

  const cancelComposer = () => {
    setDraft({ damageType: "", conditionNote: "" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const commitComposer = () => {
    const damageType = draft.damageType.trim();
    if (!damageType) {
      setDraftError(`${title} need a damage type.`);
      return;
    }

    onAdd({ damageType, conditionNote: draft.conditionNote.trim() });
    setDraft({ damageType: "", conditionNote: "" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter") {
      if (target.tagName !== "INPUT") return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      commitComposer();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      cancelComposer();
    }
  };

  const removeRow = (id: string) => {
    onRemove(id);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  return (
    <div className={styles.rowGroup}>
      <div className={styles.rowGroupHeader}>
        <h4>{title}</h4>
        <button
          ref={addButtonRef}
          type="button"
          className={`${styles.toolButton} ${styles.plusButton}`}
          onClick={openComposer}
          aria-expanded={isComposing}
        >
          <FiPlus aria-hidden="true" />
          Add
        </button>
      </div>
      <div className={styles.rowList}>
        {isComposing && (
          <div className={`${styles.compactComposer} ${styles.damageRow}`}>
            <ComboboxInput
              inputRef={firstInputRef}
              id={`${fieldPrefix}-composer-damage-type`}
              name={`${fieldPrefix}-composer-damage-type`}
              options={DAMAGE_TYPE_OPTIONS}
              value={draft.damageType}
              onChange={(value) => {
                setDraft((current) => ({ ...current, damageType: value }));
                setDraftError(null);
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder="Damage type"
              aria-label={`${title} damage type`}
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? `${fieldPrefix}-composer-error` : undefined}
              inputClassName={draftError ? styles.inputError : undefined}
              clearLabel={`Clear ${title.toLowerCase()} damage type`}
            />
            <details className={styles.optionalNoteDetails} open={Boolean(draft.conditionNote.trim())}>
              <summary className={styles.optionalNoteSummary}>Note</summary>
              <input
                id={`${fieldPrefix}-composer-note`}
                name={`${fieldPrefix}-composer-note`}
                type="text"
                value={draft.conditionNote}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, conditionNote: event.target.value }))
                }
                onKeyDown={handleComposerKeyDown}
                placeholder="from nonmagical attacks"
                aria-label={`${title} note`}
              />
            </details>
            <div className={styles.composerActions}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.confirmButton}`}
                onClick={commitComposer}
                aria-label={`Add ${title}`}
              >
                <FiCheck aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={cancelComposer}
                aria-label={`Cancel ${title}`}
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            {draftError && (
              <div id={`${fieldPrefix}-composer-error`} className={styles.rowError}>
                {draftError}
              </div>
            )}
          </div>
        )}
        {rows.map((row) => {
          const error = getError?.(row.id);
          const errorId = `${fieldPrefix}-${row.id}-error`;
          const fieldKey = `${fieldPrefix}.${row.id}`;

          return (
            <div key={row.id} className={styles.rowItem}>
              <div className={`${styles.inlineRow} ${styles.damageRow}`}>
                <ComboboxInput
                  id={`${fieldPrefix}-${row.id}-damage-type`}
                  name={`${fieldPrefix}-${row.id}-damage-type`}
                  options={DAMAGE_TYPE_OPTIONS}
                  value={row.damageType}
                  onChange={(value) => onUpdate(row.id, { damageType: value })}
                  placeholder="fire"
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  aria-label={`${title} damage type`}
                  inputClassName={error ? styles.inputError : undefined}
                  data-field={fieldKey}
                  clearLabel={`Clear ${title.toLowerCase()} damage type`}
                />
                <details className={styles.optionalNoteDetails} open={Boolean(row.conditionNote.trim())}>
                  <summary className={styles.optionalNoteSummary}>Add note</summary>
                  <input
                    id={`${fieldPrefix}-${row.id}-note`}
                    name={`${fieldPrefix}-${row.id}-note`}
                    type="text"
                    value={row.conditionNote}
                    onChange={(event) => onUpdate(row.id, { conditionNote: event.target.value })}
                    placeholder="Condition note; e.g from non magical attacks"
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={Boolean(error) || undefined}
                    aria-label={`${title} note`}
                    className={error ? styles.inputError : undefined}
                    data-field={fieldKey}
                  />
                </details>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.dangerButton}`}
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove ${title}`}
                >
                  <FiTrash2 aria-hidden="true" />
                </button>
              </div>
              {error && (
                <div id={errorId} className={styles.rowError}>
                  {error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type ConditionImmunityRowsProps = {
  rows: ConditionImmunityDraft[];
  onAdd: (row: Omit<ConditionImmunityDraft, "id">) => void;
  onUpdate: (id: string, patch: Partial<ConditionImmunityDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const ConditionImmunityRows: React.FC<ConditionImmunityRowsProps> = ({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState({ conditionName: "", conditionNote: "" });
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (isComposing) firstInputRef.current?.focus();
  }, [isComposing]);

  const openComposer = () => {
    setIsComposing(true);
    setDraftError(null);
  };

  const cancelComposer = () => {
    setDraft({ conditionName: "", conditionNote: "" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const commitComposer = () => {
    const conditionName = draft.conditionName.trim();
    if (!conditionName) {
      setDraftError("Condition immunities need a condition.");
      return;
    }

    onAdd({ conditionName, conditionNote: draft.conditionNote.trim() });
    setDraft({ conditionName: "", conditionNote: "" });
    setDraftError(null);
    setIsComposing(false);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter") {
      if (target.tagName !== "INPUT") return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      commitComposer();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      cancelComposer();
    }
  };

  const removeRow = (id: string) => {
    onRemove(id);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  return (
    <div className={styles.rowGroup}>
      <div className={styles.rowGroupHeader}>
        <h4>Condition Immunities</h4>
        <button
          ref={addButtonRef}
          type="button"
          className={`${styles.toolButton} ${styles.plusButton}`}
          onClick={openComposer}
          aria-expanded={isComposing}
        >
          <FiPlus aria-hidden="true" />
          Condition
        </button>
      </div>
      <div className={styles.rowList}>
        {isComposing && (
          <div className={`${styles.compactComposer} ${styles.conditionRow}`}>
            <ComboboxInput
              inputRef={firstInputRef}
              id="condition-immunities-composer-condition"
              name="condition-immunities-composer-condition"
              options={CONDITION_OPTIONS}
              value={draft.conditionName}
              onChange={(value) => {
                setDraft((current) => ({ ...current, conditionName: value }));
                setDraftError(null);
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder="Condition"
              aria-label="Condition immunity"
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? "condition-immunities-composer-error" : undefined}
              inputClassName={draftError ? styles.inputError : undefined}
              clearLabel="Clear condition immunity"
            />
            <details className={styles.optionalNoteDetails} open={Boolean(draft.conditionNote.trim())}>
              <summary className={styles.optionalNoteSummary}>Note</summary>
              <input
                id="condition-immunities-composer-note"
                name="condition-immunities-composer-note"
                type="text"
                value={draft.conditionNote}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, conditionNote: event.target.value }))
                }
                onKeyDown={handleComposerKeyDown}
                placeholder="optional note"
                aria-label="Condition immunity note"
              />
            </details>
            <div className={styles.composerActions}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.confirmButton}`}
                onClick={commitComposer}
                aria-label="Add condition immunity"
              >
                <FiCheck aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={cancelComposer}
                aria-label="Cancel condition immunity"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            {draftError && (
              <div id="condition-immunities-composer-error" className={styles.rowError}>
                {draftError}
              </div>
            )}
          </div>
        )}
        {rows.map((row) => {
          const error = getError?.(row.id);
          const errorId = `condition-immunities-${row.id}-error`;
          const fieldKey = `conditionImmunities.${row.id}`;

          return (
            <div key={row.id} className={styles.rowItem}>
              <div className={`${styles.inlineRow} ${styles.conditionRow}`}>
                <ComboboxInput
                  id={`condition-immunities-${row.id}-condition`}
                  name={`condition-immunities-${row.id}-condition`}
                  options={CONDITION_OPTIONS}
                  value={row.conditionName}
                  onChange={(value) => onUpdate(row.id, { conditionName: value })}
                  placeholder="poisoned"
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  aria-label="Condition immunity"
                  inputClassName={error ? styles.inputError : undefined}
                  data-field={fieldKey}
                  clearLabel="Clear condition immunity"
                />
                <details className={styles.optionalNoteDetails} open={Boolean(row.conditionNote.trim())}>
                  <summary className={styles.optionalNoteSummary}>Add note</summary>
                  <input
                    id={`condition-immunities-${row.id}-note`}
                    name={`condition-immunities-${row.id}-note`}
                    type="text"
                    value={row.conditionNote}
                    onChange={(event) => onUpdate(row.id, { conditionNote: event.target.value })}
                    placeholder="optional note"
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={Boolean(error) || undefined}
                    aria-label="Condition immunity note"
                    className={error ? styles.inputError : undefined}
                    data-field={fieldKey}
                  />
                </details>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.dangerButton}`}
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove condition immunity"
                >
                  <FiTrash2 aria-hidden="true" />
                </button>
              </div>
              {error && (
                <div id={errorId} className={styles.rowError}>
                  {error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type EntryRowsProps = {
  title: string;
  fieldPrefix: string;
  rows: TextEntryDraft[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<TextEntryDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const EntryRows: React.FC<EntryRowsProps> = ({
  title,
  fieldPrefix,
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>{title}</h4>
      <button type="button" className={`${styles.toolButton} ${styles.plusButton}`} onClick={onAdd}>
        <FiPlus aria-hidden="true" />
        Trait
      </button>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => {
        const error = getError?.(row.id);
        const errorId = `${fieldPrefix}-${row.id}-error`;
        const fieldKey = `${fieldPrefix}.${row.id}`;

        return (
          <div key={row.id} className={styles.entryCard}>
            <div className={`${styles.inlineRow} ${styles.actionRow}`}>
              <input
                id={`${fieldPrefix}-${row.id}-name`}
                name={`${fieldPrefix}-${row.id}-name`}
                type="text"
                value={row.name}
                onChange={(event) => onUpdate(row.id, { name: event.target.value })}
                placeholder="Name"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={Boolean(error) || undefined}
                aria-label={`${title} name`}
                className={error ? styles.inputError : undefined}
                data-field={fieldKey}
              />
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${title}`}
              >
                <FiTrash2 aria-hidden="true" />
              </button>
            </div>
            <textarea
              id={`${fieldPrefix}-${row.id}-description`}
              name={`${fieldPrefix}-${row.id}-description`}
              rows={3}
              value={row.description}
              onChange={(event) => onUpdate(row.id, { description: event.target.value })}
              placeholder="Description"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error) || undefined}
              aria-label={`${title} description`}
              className={error ? styles.inputError : undefined}
              data-field={fieldKey}
            />
            {error && (
              <div id={errorId} className={styles.rowError}>
                {error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

type ActionRowsProps = {
  rows: ActionEntryDraft[];
  onAdd: (actionType: string) => void;
  onUpdate: (id: string, patch: Partial<ActionEntryDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const ActionRows: React.FC<ActionRowsProps> = ({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>Actions</h4>
      <div className={styles.presetRow}>
        {ACTION_TYPE_OPTIONS.filter((option) =>
          ["action", "bonus action", "reaction", "legendary"].includes(option.value)
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.presetButton} ${styles.plusButton}`}
            onClick={() => onAdd(option.value)}
          >
            <FiPlus aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => {
        const error = getError?.(row.id);
        const errorId = `actions-${row.id}-error`;
        const fieldKey = `actions.${row.id}`;

        return (
          <div key={row.id} className={styles.entryCard}>
            <div className={styles.inlineRow}>
              <input
                id={`actions-${row.id}-name`}
                name={`actions-${row.id}-name`}
                type="text"
                value={row.name}
                onChange={(event) => onUpdate(row.id, { name: event.target.value })}
                placeholder="Name"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={Boolean(error) || undefined}
                aria-label="Action name"
                className={error ? styles.inputError : undefined}
                data-field={fieldKey}
              />
              <select
                id={`actions-${row.id}-type`}
                name={`actions-${row.id}-type`}
                value={row.actionType}
                onChange={(event) => onUpdate(row.id, { actionType: event.target.value })}
                aria-label="Action type"
              >
                
                {ACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onRemove(row.id)}
                aria-label="Remove action"
              >
                <FiTrash2 aria-hidden="true" />
              </button>
            </div>
            <textarea
              id={`actions-${row.id}-description`}
              name={`actions-${row.id}-description`}
              rows={3}
              value={row.description}
              onChange={(event) => onUpdate(row.id, { description: event.target.value })}
              placeholder="Description"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error) || undefined}
              aria-label="Action description"
              className={error ? styles.inputError : undefined}
              data-field={fieldKey}
            />
            {error && (
              <div id={errorId} className={styles.rowError}>
                {error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

type SpellcastingRowsProps = {
  rows: SpellcastingDraft[];
  abilityScores: AbilityScoresDraft;
  proficiencyBonus: number;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SpellcastingDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const SpellcastingRows: React.FC<SpellcastingRowsProps> = ({
  rows,
  abilityScores,
  proficiencyBonus,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>Spellcasting Blocks</h4>
      <button type="button" className={`${styles.toolButton} ${styles.plusButton}`} onClick={onAdd}>
        <FiPlus aria-hidden="true" />
        Spellcasting
      </button>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => {
        const error = getError?.(row.id);
        const errorId = `spellcasting-${row.id}-error`;
        const updateAbility = (ability: string) => {
          const currentSaveDc = getSpellSaveDc(row.ability, abilityScores, proficiencyBonus);
          const currentAttackBonus = getSpellAttackBonus(row.ability, abilityScores, proficiencyBonus);
          const nextSaveDc = getSpellSaveDc(ability, abilityScores, proficiencyBonus);
          const nextAttackBonus = getSpellAttackBonus(ability, abilityScores, proficiencyBonus);
          const patch: Partial<SpellcastingDraft> = { ability };

          if (!row.saveDc.trim() || row.saveDc === currentSaveDc) {
            patch.saveDc = nextSaveDc;
          }
          if (!row.spellAttackBonus.trim() || row.spellAttackBonus === currentAttackBonus) {
            patch.spellAttackBonus = nextAttackBonus;
          }

          onUpdate(row.id, patch);
        };

        return (
          <div key={row.id} className={styles.entryCard}>
            <div className={styles.gridTwo}>
              <Field label="Name" name={`spellcasting-${row.id}-name`}>
                <input
                  type="text"
                  value={row.name}
                  onChange={(event) => onUpdate(row.id, { name: event.target.value })}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  className={error ? styles.inputError : undefined}
                  data-field={`spellcasting.${row.id}`}
                />
              </Field>
              <Field label="Display As" name={`spellcasting-${row.id}-display-as`}>
                <select
                  value={row.displayAs}
                  onChange={(event) => onUpdate(row.id, { displayAs: event.target.value })}
                >
                  {SPELLCASTING_DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ability" name={`spellcasting-${row.id}-ability`}>
                <select
                  value={row.ability}
                  onChange={(event) => updateAbility(event.target.value)}
                >
                  {SPELLCASTING_ABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className={styles.inlineControl}>
                <Field label="Save DC" name={`spellcasting-${row.id}-save-dc`}>
                  <NumberStepper
                    id={`spellcasting-${row.id}-save-dc`}
                    name={`spellcasting-${row.id}-save-dc`}
                    value={row.saveDc}
                    onChange={(value) => onUpdate(row.id, { saveDc: value })}
                    min={0}
                    aria-label="Spell save DC"
                  />
                </Field>
                <Field label="Attack" name={`spellcasting-${row.id}-attack`}>
                  <NumberStepper
                    id={`spellcasting-${row.id}-attack`}
                    name={`spellcasting-${row.id}-attack`}
                    value={row.spellAttackBonus}
                    onChange={(value) => onUpdate(row.id, { spellAttackBonus: value })}
                    format="signed"
                    aria-label="Spell attack bonus"
                  />
                </Field>
              </div>
            </div>
            <Field label="Descriptions" name={`spellcasting-${row.id}-descriptions`}>
              <textarea
                rows={4}
                value={row.descriptionsText}
                onChange={(event) => onUpdate(row.id, { descriptionsText: event.target.value })}
                aria-describedby={error ? errorId : undefined}
              />
            </Field>
            {error && (
              <div id={errorId} className={styles.rowError}>
                {error}
              </div>
            )}
            <div className={styles.entryCardActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onRemove(row.id)}
              >
                <FiTrash2 aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const ensureCurrentOption = (
  options: readonly RecordOption[],
  value: string
): RecordOption[] => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue || getRecordOption(options, normalizedValue)) {
    return [...options];
  }

  return [
    ...options,
    {
      value: normalizedValue,
      label: titleCase(normalizedValue),
      ability: "wis",
    },
  ];
};
