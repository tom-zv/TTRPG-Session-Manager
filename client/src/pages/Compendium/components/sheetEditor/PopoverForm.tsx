import React, { useEffect, useId, useRef } from "react";
import type { FieldOption, FieldSpec } from "./fieldSpec.js";
import { useActiveSheetEdit, useCommitHandler } from "./SheetEditContext.js";
import styles from "./SheetEditor.module.css";

type PopoverFormProps = {
  /** Commits the editor's local state; returns false (after setting `error`) when it is invalid. */
  onApply: () => boolean;
  error?: string | null;
  children: React.ReactNode;
};

/** The frame of every popover editor: Enter or Done commits, Cancel and Escape discard. */
export const PopoverForm: React.FC<PopoverFormProps> = ({ onApply, error, children }) => {
  const edit = useActiveSheetEdit();
  const errorId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useCommitHandler(onApply, formRef);
  // A newly mounted issue editor follows the jump even when StrictMode replays its mount effects.
  useEffect(() => {
    if (edit.editorFocusId !== null) {
      edit.focusOpenRef.current?.(edit.editorFocusId);
      return;
    }
    formRef.current?.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)")?.focus();
  }, [edit.editorFocusId, edit.focusOpenRef]);
  return (
    <form
      ref={formRef}
      className={styles.form}
      aria-describedby={error ? errorId : undefined}
      onSubmit={event => {
        event.preventDefault();
        if (onApply()) edit.close(true);
      }}
    >
      {children}
      {error && <p id={errorId} role="alert" className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        <button type="button" onClick={() => edit.close(true)}>Cancel</button>
        <button type="submit">Done</button>
      </div>
    </form>
  );
};

export const Field: React.FC<{ label: string; children: (id: string) => React.ReactNode }> = ({ label, children }) => {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
};

/** Opening the picker leaves the group untouched until a choice is made. Its prompt is not a choice in the list. */
export const AddChoice: React.FC<{
  label: string;
  fieldId?: string;
  options: readonly FieldOption[];
  onPick: (value: string) => void;
}> = ({ label, fieldId, options, onPick }) => (
  <select aria-label={label} data-sheet-field-id={fieldId} value="" disabled={!options.length} onChange={event => onPick(event.target.value)}>
    <option value="" disabled hidden>+ {label}</option>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
);

/**
 * A native suggestion list. It offers values only: a browser shows a label that differs from its
 * value beside it ("slashing  Slashing"), not instead of it.
 */
export const SuggestionList: React.FC<{ id: string; options: readonly FieldOption[] }> = ({ id, options }) => (
  <datalist id={id}>
    {options.map(option => <option key={option.value} value={option.value} />)}
  </datalist>
);

type SpecControlProps<Draft, Modes> = {
  spec: FieldSpec<Draft, Modes>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/** A field spec as a labelled control in an editor: a select for a choice, otherwise an input with its suggestions. */
export function SpecControl<Draft, Modes>({ spec, value, onChange, placeholder }: SpecControlProps<Draft, Modes>): React.ReactElement {
  return (
    <Field label={spec.label}>
      {id => spec.options ? (
        <select id={id} data-sheet-field-id={spec.id} value={value} onChange={event => onChange(event.target.value)}>
          {/* A stored value outside the list stays selectable. */}
          {!spec.options.some(option => option.value === value) && <option value={value}>{value}</option>}
          {spec.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <>
          <input
            id={id}
            data-sheet-field-id={spec.id}
            inputMode={spec.inputMode}
            list={spec.suggestions ? `${id}-list` : undefined}
            placeholder={placeholder}
            value={value}
            onChange={event => onChange(event.target.value)}
          />
          {spec.suggestions && <SuggestionList id={`${id}-list`} options={spec.suggestions} />}
        </>
      )}
    </Field>
  );
}

/** Text that may be blank: blank clears a nullable column, but an untouched legacy value stays as it was. */
export const clearable = (text: string, original: string | null | undefined): string | null | undefined =>
  text.trim() || (original ? null : original);

/** An empty list that replaces an absent one changes nothing. */
export const keepAbsent = <T, O extends T[] | null | undefined>(items: T[], original: O): T[] | O =>
  items.length === 0 && !original?.length ? original : items;
