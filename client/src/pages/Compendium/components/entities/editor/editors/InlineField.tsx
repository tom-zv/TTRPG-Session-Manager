import React, { useEffect, useId, useRef } from "react";
import { useActiveEdit, useCommitHandler, useEditorState } from "../EntityEditContext.js";
import styles from "../EntityEditor.module.css";

export type InlineParse = { ok: true; apply: () => string | undefined } | { ok: false; message: string };

type InlineFieldProps = {
  /** Accessible name of the input, e.g. "Armor Class". */
  label: string;
  /** The value as text. Committing the same text changes nothing. */
  value: string;
  parse: (text: string) => InlineParse;
  inputMode?: "numeric" | "text";
  /** Id of a `<datalist>` that offers suggestions. */
  list?: string;
  /** Tab moves to this neighbouring target's editor; return its id, or nothing to leave Tab alone. */
  neighbour?: (direction: 1 | -1) => string | undefined;
  /** Shown beside the input, e.g. the proficiency bonus a CR gives. */
  hint?: (text: string) => string;
};

/**
 * An input in place of a single value. Enter or blur commits, Escape reverts, and invalid text
 * keeps the editor open with its message.
 */
export const InlineField: React.FC<InlineFieldProps> = ({ label, value, parse, inputMode, list, neighbour, hint }) => {
  const edit = useActiveEdit();
  const [text, setText] = useEditorState("inline.text", value);
  const [error, setError] = useEditorState<string | null>("inline.error", null);
  const settled = useRef(false);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = (): boolean => {
    if (settled.current) return true;
    if (text !== value) {
      const result = parse(text);
      const problem = result.ok ? result.apply() : result.message;
      if (problem) {
        setError(problem);
        return false;
      }
    }
    // Once settled, a blur that follows Enter, Escape or Tab must not close the next editor.
    settled.current = true;
    return true;
  };
  useCommitHandler(commit);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commit()) edit.close(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settled.current = true;
      edit.close(true);
    } else if (event.key === "Tab") {
      const next = neighbour?.(event.shiftKey ? -1 : 1);
      if (next === undefined) return;
      event.preventDefault();
      edit.open(next);
    }
  };

  return (
    <span className={styles.inlineField}>
      <input
        ref={inputRef}
        className={styles.inlineInput}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        inputMode={inputMode}
        list={list}
        value={text}
        onChange={event => {
          setText(event.target.value);
          setError(null);
        }}
        onFocus={event => event.currentTarget.select()}
        onBlur={() => {
          if (!settled.current && commit()) edit.close();
        }}
        onKeyDown={onKeyDown}
      />
      {hint && <span className={styles.hint}>{hint(text)}</span>}
      {error && <span id={errorId} role="alert" className={styles.error}>{error}</span>}
    </span>
  );
};

export const parseWhole = (text: string, min: number, max: number): number | undefined => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : undefined;
};
