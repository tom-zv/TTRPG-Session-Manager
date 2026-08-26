import React, { useEffect, useId, useRef } from "react";
import { useActiveEdit, useCommitHandler } from "../EntityEditContext.js";
import styles from "../EntityEditor.module.css";

type PopoverFormProps = {
  /** Commits the editor's local state; returns false (after setting `error`) when it is invalid. */
  onApply: () => boolean;
  error?: string | null;
  children: React.ReactNode;
};

/** The frame of every popover editor: Enter or Done commits, Cancel and Escape discard. */
export const PopoverForm: React.FC<PopoverFormProps> = ({ onApply, error, children }) => {
  const edit = useActiveEdit();
  const errorId = useId();
  useCommitHandler(onApply);
  const formRef = useRef<HTMLFormElement>(null);
  // A popover opens on a user's action: put focus on its first enabled control.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)")?.focus();
  }, []);
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

/** Text that may be blank: blank clears a nullable column, but an untouched legacy value stays as it was. */
export const clearable = (text: string, original: string | null | undefined): string | null | undefined =>
  text.trim() || (original ? null : original);

/** An empty list that replaces an absent one changes nothing. */
export const keepAbsent = <T, O extends T[] | null | undefined>(items: T[], original: O): T[] | O =>
  items.length === 0 && !original?.length ? original : items;
