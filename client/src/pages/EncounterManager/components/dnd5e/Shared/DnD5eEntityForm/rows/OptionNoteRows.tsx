import React from "react";
import { FiCheck, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { ComboboxInput, type ComboboxOption } from "src/components/FormControls/index.js";
import { useRowComposer } from "../hooks/useRowComposer.js";
import type {
  ConditionImmunityDraft,
  DamageModifierDraft,
} from "../DnD5eEntityForm.types.js";
import styles from "./DnD5eEntityFormRows.module.css";

type OptionNoteDraft = DamageModifierDraft | ConditionImmunityDraft;
type DraftWithoutId = Omit<DamageModifierDraft, "id"> | Omit<ConditionImmunityDraft, "id">;

type OptionNoteRowsProps<Row extends OptionNoteDraft> = {
  title: string;
  fieldPrefix: string;
  addLabel: string;
  optionField: Row extends DamageModifierDraft ? "damageType" : "conditionName";
  noteField: "conditionNote";
  options: readonly ComboboxOption[];
  rows: Row[];
  optionPlaceholder: string;
  notePlaceholder: string;
  composerError: string;
  optionAriaLabel: string;
  noteAriaLabel: string;
  clearLabel: string;
  onAdd: (row: DraftWithoutId) => void;
  onUpdate: (id: string, patch: Partial<Row>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

type ComposerDraft = {
  optionValue: string;
  conditionNote: string;
};

export const OptionNoteRows = <Row extends OptionNoteDraft>({
  title,
  fieldPrefix,
  addLabel,
  optionField,
  noteField,
  options,
  rows,
  optionPlaceholder,
  notePlaceholder,
  composerError,
  optionAriaLabel,
  noteAriaLabel,
  clearLabel,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}: OptionNoteRowsProps<Row>) => {
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
  } = useRowComposer<HTMLInputElement, ComposerDraft>(() => ({
    optionValue: "",
    conditionNote: "",
  }));

  const commitComposer = () => {
    const optionValue = composerDraft.optionValue.trim();
    if (!optionValue) {
      setDraftError(composerError);
      return;
    }

    onAdd({
      [optionField]: optionValue,
      [noteField]: composerDraft.conditionNote.trim(),
    } as DraftWithoutId);
    completeComposer();
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
          <div className={`${styles.compactComposer} ${styles.optionNoteRow}`}>
            <ComboboxInput
              inputRef={firstInputRef}
              id={`${fieldPrefix}-composer-option`}
              name={`${fieldPrefix}-composer-option`}
              options={options}
              value={composerDraft.optionValue}
              onChange={(value) => {
                setComposerDraft((current) => ({ ...current, optionValue: value }));
                setDraftError(null);
              }}
              onKeyDown={(event) => handleComposerKeyDown(event, commitComposer)}
              placeholder={optionPlaceholder}
              aria-label={optionAriaLabel}
              aria-invalid={Boolean(draftError) || undefined}
              aria-describedby={draftError ? `${fieldPrefix}-composer-error` : undefined}
              inputClassName={draftError ? styles.inputError : undefined}
              clearLabel={clearLabel}
            />
            <OptionalNote
              id={`${fieldPrefix}-composer-note`}
              name={`${fieldPrefix}-composer-note`}
              value={composerDraft.conditionNote}
              placeholder={notePlaceholder}
              ariaLabel={noteAriaLabel}
              onChange={(value) =>
                setComposerDraft((current) => ({ ...current, conditionNote: value }))
              }
              onKeyDown={(event) => handleComposerKeyDown(event, commitComposer)}
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
        {rows.map((row) => {
          const error = getError?.(row.id);
          const errorId = `${fieldPrefix}-${row.id}-error`;
          const fieldKey = `${fieldPrefix}.${row.id}`;
          const optionValue = String(row[optionField as keyof Row] ?? "");

          return (
            <div key={row.id} className={styles.rowItem}>
              <div className={`${styles.inlineRow} ${styles.optionNoteRow}`}>
                <ComboboxInput
                  id={`${fieldPrefix}-${row.id}-option`}
                  name={`${fieldPrefix}-${row.id}-option`}
                  options={options}
                  value={optionValue}
                  onChange={(value) =>
                    onUpdate(row.id, { [optionField]: value } as Partial<Row>)
                  }
                  placeholder={optionPlaceholder}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  aria-label={optionAriaLabel}
                  inputClassName={error ? styles.inputError : undefined}
                  data-field={fieldKey}
                  clearLabel={clearLabel}
                />
                <OptionalNote
                  id={`${fieldPrefix}-${row.id}-note`}
                  name={`${fieldPrefix}-${row.id}-note`}
                  value={row.conditionNote}
                  placeholder={notePlaceholder}
                  ariaLabel={noteAriaLabel}
                  error={error}
                  errorId={errorId}
                  dataField={fieldKey}
                  onChange={(value) =>
                    onUpdate(row.id, { [noteField]: value } as Partial<Row>)
                  }
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

const OptionalNote: React.FC<{
  id: string;
  name: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  error?: string;
  errorId?: string;
  dataField?: string;
}> = ({
  id,
  name,
  value,
  placeholder,
  ariaLabel,
  onChange,
  onKeyDown,
  error,
  errorId,
  dataField,
}) => (
  <details className={styles.optionalNoteDetails} open={Boolean(value.trim())}>
    <summary className={styles.optionalNoteSummary}>{value.trim() ? "Note" : "Add note"}</summary>
    <input
      id={id}
      name={name}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={Boolean(error) || undefined}
      aria-label={ariaLabel}
      className={error ? styles.inputError : undefined}
      data-field={dataField}
    />
  </details>
);

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
