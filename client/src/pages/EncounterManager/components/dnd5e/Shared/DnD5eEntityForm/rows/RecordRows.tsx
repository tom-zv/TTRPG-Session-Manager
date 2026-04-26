import React from "react";
import { FiCheck, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { NumberStepper } from "src/components/FormControls/index.js";
import { titleCase } from "../../dnd5eUtils.js";
import { useRowComposer } from "../hooks/useRowComposer.js";
import {
  getRecordDefaultValue,
  getRecordEntryValue,
  getRecordOption,
} from "../model/calculations.js";
import type {
  AbilityScoresDraft,
  RecordEntryDraft,
  RecordEntryMode,
  RecordOption,
} from "../DnD5eEntityForm.types.js";
import styles from "./DnD5eEntityFormRows.module.css";

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

type RecordComposerDraft = Omit<RecordEntryDraft, "id">;

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
  const {
    addButtonRef,
    firstInputRef,
    isComposing,
    draft: composerDraft,
    setDraft: setComposerDraft,
    draftError,
    setDraftError,
    openComposer,
    cancelComposer,
    completeComposer,
    handleComposerKeyDown,
    refocusAddButton,
  } = useRowComposer<HTMLSelectElement, RecordComposerDraft>(() => ({
    key: "",
    value: "",
    mode: "proficient",
  }));

  const getDisplayedRecordValue = (row: Pick<RecordEntryDraft, "key" | "mode" | "value">) =>
    getRecordEntryValue(row, options, abilityScores, proficiencyBonus);

  const commitComposer = () => {
    const key = composerDraft.key.trim();
    const value = getDisplayedRecordValue(composerDraft).trim();
    if (!key || !value) {
      setDraftError(`${title} rows need both a name and a value.`);
      return;
    }

    onAdd({ key, value, mode: composerDraft.mode });
    completeComposer();
  };

  const updateDraftKey = (key: string) => {
    setComposerDraft((current) => ({
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
    setComposerDraft((current) => ({
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

  const removeRow = (id: string) => {
    onRemove(id);
    refocusAddButton();
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
              value={composerDraft.key}
              onChange={(event) => updateDraftKey(event.target.value)}
              onKeyDown={(event) => handleComposerKeyDown(event, commitComposer)}
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
              value={composerDraft.mode}
              onChange={(event) => updateDraftMode(event.target.value as RecordEntryMode)}
              onKeyDown={(event) => handleComposerKeyDown(event, commitComposer)}
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
              value={getDisplayedRecordValue(composerDraft)}
              onChange={(value) => {
                setComposerDraft((current) => ({ ...current, value }));
                setDraftError(null);
              }}
              onKeyDown={(event) => handleComposerKeyDown(event, commitComposer)}
              disabled={composerDraft.mode !== "custom"}
              format="signed"
              placeholder="+3"
              aria-label={`${title} value`}
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? `${fieldPrefix}-composer-error` : undefined}
              inputClassName={draftError ? styles.inputError : undefined}
            />
            <ComposerActions
              title={title}
              onConfirm={commitComposer}
              onCancel={cancelComposer}
            />
            {draftError && (
              <div id={`${fieldPrefix}-composer-error`} className={styles.rowError}>
                {draftError}
              </div>
            )}
          </div>
        )}
        {rows.map((row) => (
          <RecordRow
            key={row.id}
            row={row}
            title={title}
            addLabel={addLabel}
            fieldPrefix={fieldPrefix}
            options={ensureCurrentOption(options, row.key)}
            displayedValue={getDisplayedRecordValue(row)}
            error={getError?.(row.id)}
            onUpdate={onUpdate}
            onUpdateKey={updateRowKey}
            onUpdateMode={updateRowMode}
            onRemove={removeRow}
          />
        ))}
      </div>
    </div>
  );
};

type RecordRowProps = {
  row: RecordEntryDraft;
  title: string;
  addLabel: string;
  fieldPrefix: string;
  options: RecordOption[];
  displayedValue: string;
  error?: string;
  onUpdate: (id: string, patch: Partial<RecordEntryDraft>) => void;
  onUpdateKey: (row: RecordEntryDraft, key: string) => void;
  onUpdateMode: (row: RecordEntryDraft, mode: RecordEntryMode) => void;
  onRemove: (id: string) => void;
};

const RecordRow: React.FC<RecordRowProps> = ({
  row,
  title,
  addLabel,
  fieldPrefix,
  options,
  displayedValue,
  error,
  onUpdate,
  onUpdateKey,
  onUpdateMode,
  onRemove,
}) => {
  const errorId = `${fieldPrefix}-${row.id}-error`;
  const fieldKey = `${fieldPrefix}.${row.id}`;

  return (
    <div className={styles.rowItem}>
      <div className={`${styles.inlineRow} ${styles.recordRow}`}>
        <select
          id={`${fieldPrefix}-${row.id}-name`}
          name={`${fieldPrefix}-${row.id}-name`}
          value={row.key}
          onChange={(event) => onUpdateKey(row, event.target.value)}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-label={`${title} name`}
          className={error ? styles.inputError : undefined}
          data-field={fieldKey}
        >
          <option value="">Select {addLabel.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          id={`${fieldPrefix}-${row.id}-mode`}
          name={`${fieldPrefix}-${row.id}-mode`}
          value={row.mode}
          onChange={(event) => onUpdateMode(row, event.target.value as RecordEntryMode)}
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
          onClick={() => onRemove(row.id)}
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
};

const ComposerActions: React.FC<{
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, onConfirm, onCancel }) => (
  <div className={styles.composerActions}>
    <button
      type="button"
      className={`${styles.iconButton} ${styles.confirmButton}`}
      onClick={onConfirm}
      aria-label={`Add ${title}`}
    >
      <FiCheck aria-hidden="true" />
    </button>
    <button type="button" className={styles.iconButton} onClick={onCancel} aria-label={`Cancel ${title}`}>
      <FiX aria-hidden="true" />
    </button>
  </div>
);

const ensureCurrentOption = (
  options: readonly RecordOption[],
  value: string
): RecordOption[] => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue || getRecordOption(options, normalizedValue)) return [...options];

  return [
    ...options,
    {
      value: normalizedValue,
      label: titleCase(normalizedValue),
      ability: "wis",
    },
  ];
};
