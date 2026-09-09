import React, { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ComboboxInput } from "src/components/FormControls/ComboboxInput.js";
import { FiX } from "react-icons/fi";
import { commitParse, editToken, fail, tokenKeys, tokenProblem, type FieldOption, type FieldParse, type FieldSpec, type TokenListSpec } from "../fieldSpec.js";
import { useActiveSheetEdit } from "../SheetEditContext.js";
import styles from "./LiveFields.module.css";

/**
 * Live fields: in the `live` presentation the sheet's values are inputs, always mounted and sized
 * and styled like the text they replace. Only a value's own text changes its width; hover, focus,
 * errors and asides never move the sheet.
 */

/**
 * Connects a live control to the sheet: issue jumps and focus requests find it by any of `ids`, and
 * `claim` keeps the one-open-editor rule (focusing or changing it commits and closes any
 * click-to-edit editor; an invalid one stays open, takes focus back, and the live edit does not apply).
 */
export const useLiveTarget = (ids: readonly string[], ref: RefObject<HTMLElement | null>): (() => boolean) => {
  const { registerLive, claim } = useActiveSheetEdit();
  const key = ids.join("\n");
  useLayoutEffect(() => {
    const element = ref.current;
    return element && key ? registerLive(key.split("\n"), element) : undefined;
  }, [registerLive, key, ref]);
  return claim;
};

const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, " ");

type LiveInputProps<Draft, Modes> = {
  /** The issue target id: jumps and focus requests use it. */
  id: string;
  /** Where its unapplied text is kept in the editor buffer; `id` unless the id can move (a token's index). */
  bufferKey?: string;
  /** More issue target ids that focus this field, e.g. a whole line's id for its first value. */
  alsoTargets?: readonly string[];
  label: string;
  /** The field's value in a draft (undefined once it is gone); pure, so pending text can outlive the field. */
  read: (draft: Draft, modes: Modes) => string | undefined;
  /** What the text means for a draft; pure for the same reason. */
  parse: (text: string, draft: Draft, modes: Modes) => FieldParse<Draft, Modes>;
  /** After a commit applied: from Enter (focus stays with the line) or from a blur. */
  onApplied?: (fromKeyboard: boolean) => void;
  /** Shown, dimmed, while the value is empty; it also sets the empty field's width. */
  placeholder?: string;
  inputMode?: "numeric" | "text";
  suggestions?: readonly FieldOption[];
  /** An "add" field: it empties after each commit instead of showing the stored value. */
  add?: boolean;
  keepWhenBlank?: boolean;
  className?: string;
};

/**
 * A value that is its own input. Hidden copies of the stored value and of the typed text share its
 * cell, so while it is edited it is as wide as the longer of the two: it grows to show everything
 * typed and does not shrink mid-typing, then settles to the shown value once the text is applied
 * or reverted. Neighbours on its line reflow as text would. Enter or blur
 * commits, Escape reverts, and invalid text stays with its message under the field (outside the
 * flow). Text that is not applied yet is kept in the editor buffer with the field's pure read and
 * parse, so Resume, a remount or a presentation switch restores it, and Save can still apply it.
 */
export function LiveInput<Draft, Modes>({
  id, bufferKey = id, alsoTargets = [], label, read, parse, onApplied, placeholder, inputMode, suggestions, add = false, keepWhenBlank = false, className,
}: LiveInputProps<Draft, Modes>): React.ReactElement {
  const edit = useActiveSheetEdit<Draft, Modes>();
  const { buffer } = edit;
  const value = read(edit.draft, edit.modes) ?? "";
  const [restored] = useState(() => buffer?.restoreLive(bufferKey));
  const [text, setText] = useState(restored?.text ?? value);
  const [error, setError] = useState<string | null>(restored?.error ?? null);
  // Undo, Redo or another field's commit changes the value: show the new one.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
    setError(null);
  }
  // Text applied without this field (a presentation switch, Save) can fail while it is mounted:
  // the buffer then holds the message for this text, and the field shows and announces it.
  const kept = buffer?.restoreLive(bufferKey);
  const keptError = kept && kept.text === text ? kept.error : null;
  const [seenKeptError, setSeenKeptError] = useState(keptError);
  if (keptError !== seenKeptError) {
    setSeenKeptError(keptError);
    if (keptError !== null) setError(keptError);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const firstClick = useRef(false);
  const errorId = useId();
  const claim = useLiveTarget([id, ...alsoTargets], inputRef);
  // The buffer keeps the latest pure read and parse; they take the draft as an argument.
  const parseText = (typed: string, draft: Draft, modes: Modes): FieldParse<Draft, Modes> =>
    keepWhenBlank && !typed.trim() ? { ok: true, patch: {} } : parse(typed, draft, modes);
  const fieldRef = useRef({ read, parse: parseText });
  useEffect(() => {
    fieldRef.current = { read, parse: parseText };
  });

  useEffect(() => {
    if (text === value && error === null) {
      buffer?.forgetLive(bufferKey);
      return;
    }
    buffer?.keepLive(bufferKey, {
      text,
      error,
      id,
      base: value,
      read: (draft, modes) => fieldRef.current.read(draft as Draft, modes as Modes),
      parse: (typed, draft, modes) => fieldRef.current.parse(typed, draft as Draft, modes as Modes) as FieldParse<unknown, unknown>,
    });
  }, [buffer, bufferKey, id, text, value, error]);

  const commit = (fromKeyboard: boolean, typed = text) => {
    if (typed === value) {
      setText(value);
      setError(null);
      return;
    }
    // An invalid click-to-edit editor is still open: it keeps focus, and this text waits.
    if (!claim()) return;
    const problem = commitParse(edit, parseText(typed, edit.draft, edit.modes));
    if (problem) {
      setText(typed);
      setError(problem);
      return;
    }
    // Forgotten now: a commit that removes this field (a cleared token) unmounts it before its effect.
    buffer?.forgetLive(bufferKey);
    setError(null);
    // Normalized input ("  12") shows as stored; a changed value arrives through `value` instead.
    setText(add ? "" : value);
    onApplied?.(fromKeyboard);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
    } else if (event.key === "Escape" && (text !== value || error)) {
      // The first Escape reverts the text and stops here; the next reaches the editor.
      event.preventDefault();
      event.stopPropagation();
      setText(value);
      setError(null);
    }
  };
  const fieldProps = {
    "aria-label": label,
    "aria-invalid": error !== null,
    "aria-describedby": error ? errorId : undefined,
    value: text,
    placeholder,
    onFocus: () => void claim(),
    onBlur: () => commit(false),
    onKeyDown: handleKeyDown,
  };

  return (
    <span
      className={`${styles.live} ${add ? styles.add : ""} ${className ?? ""}`}
      data-invalid={error !== null || undefined}
      onPointerDownCapture={event => {
        firstClick.current = event.button === 0 && event.target === inputRef.current && document.activeElement !== event.target;
      }}
      onClickCapture={event => {
        const input = inputRef.current;
        if (firstClick.current && event.detail === 1 && input === event.target && input && input.selectionStart === input.selectionEnd) {
          input.setSelectionRange(input.value.length, input.value.length);
        }
        firstClick.current = false;
      }}
    >
      {/* A stored line break (a defense note) reads as a space, as in view mode, not as a second line. */}
      <span className={styles.mirror} aria-hidden="true">{oneLine(value || placeholder || " ")}</span>
      {text !== value && <span className={styles.mirror} aria-hidden="true">{oneLine(text)}</span>}
      {suggestions ? (
        <ComboboxInput
          {...fieldProps}
          inputRef={inputRef}
          inline
          options={suggestions}
          onChange={setText}
          onPick={option => commit(true, option)}
          inputClassName={styles.input}
        />
      ) : (
        <input
          {...fieldProps}
          ref={inputRef}
          className={styles.input}
          size={1}
          inputMode={inputMode}
          onChange={event => setText(event.target.value)}
        />
      )}
      {error && <span id={errorId} role="alert" className={styles.error}>{error}</span>}
    </span>
  );
}

type LiveSelectProps = {
  id: string;
  alsoTargets?: readonly string[];
  label: string;
  value: string;
  options: readonly FieldOption[];
  /** Applies the choice; returns why it cannot apply, or undefined. */
  onChange: (value: string) => string | undefined;
  /** An "add" menu: the shown text when nothing is chosen, e.g. "+ speed". */
  prompt?: string;
  className?: string;
};

/** A choice shown as its label's text; the native menu opens on click or keyboard. */
export const LiveSelect: React.FC<LiveSelectProps> = ({ id, alsoTargets = [], label, value, options, onChange, prompt, className }) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const claim = useLiveTarget([id, ...alsoTargets], selectRef);
  const shown = options.find(option => option.value === value)?.label ?? (prompt ?? value);
  return (
    <span className={`${styles.live} ${prompt ? styles.add : ""} ${className ?? ""}`} data-invalid={error !== null || undefined}>
      <span className={styles.mirror} aria-hidden="true">{shown}</span>
      <select
        ref={selectRef}
        className={`${styles.input} ${styles.select}`}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onFocus={() => void claim()}
        onBlur={() => setError(null)}
        onChange={event => {
          // The select is controlled: a refused change shows the stored choice again. An add
          // menu's prompt is not a choice; any other empty value (no category) is one.
          if ((prompt && event.target.value === "") || !claim()) return;
          setError(onChange(event.target.value) ?? null);
        }}
      >
        {/* The prompt is what the closed menu shows; it is not a choice in the list. */}
        {prompt && <option value="" hidden>{prompt}</option>}
        {/* A stored value outside the list stays selectable. */}
        {!prompt && !options.some(option => option.value === value) && <option value={value}>{value}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error && <span id={errorId} role="alert" className={styles.error}>{error}</span>}
    </span>
  );
};

type LiveToggleProps = {
  id: string;
  alsoTargets?: readonly string[];
  label: string;
  /** The text the sheet shows for it, e.g. a spell component's letter. */
  text: string;
  pressed: boolean;
  /** Applies the change; returns why it cannot apply, or undefined. */
  onToggle: (pressed: boolean) => string | undefined;
};

/** A flag shown as its text: a press turns it on or off. Off, the text is dimmed and struck through. */
export const LiveToggle: React.FC<LiveToggleProps> = ({ id, alsoTargets = [], label, text, pressed, onToggle }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const claim = useLiveTarget([id, ...alsoTargets], buttonRef);
  return (
    <span className={styles.live} data-invalid={error !== null || undefined}>
      <span className={styles.mirror} aria-hidden="true">{text}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.input} ${styles.toggle}`}
        aria-label={label}
        aria-pressed={pressed}
        aria-describedby={error ? errorId : undefined}
        onFocus={() => void claim()}
        onBlur={() => setError(null)}
        onClick={() => {
          if (!claim()) return;
          setError(onToggle(!pressed) ?? null);
        }}
      >
        {text}
      </button>
      {error && <span id={errorId} role="alert" className={styles.error}>{error}</span>}
    </span>
  );
};

type LiveSpecFieldProps<Draft, Modes> = {
  spec: FieldSpec<Draft, Modes>;
  keepWhenBlank?: boolean;
  alsoTargets?: readonly string[];
  className?: string;
};

/** A field spec as a live control: a select for a choice, otherwise an input (with its suggestions). */
export function LiveSpecField<Draft, Modes>({ spec, alsoTargets, className, keepWhenBlank }: LiveSpecFieldProps<Draft, Modes>): React.ReactElement {
  const edit = useActiveSheetEdit<Draft, Modes>();
  if (spec.options) {
    return (
      <LiveSelect
        id={spec.id}
        alsoTargets={alsoTargets}
        label={spec.label}
        value={spec.read(edit.draft, edit.modes)}
        options={spec.options}
        onChange={text => commitParse(edit, spec.parse(text, edit.draft, edit.modes))}
        className={className}
      />
    );
  }
  return (
    <LiveInput
      id={spec.id}
      alsoTargets={alsoTargets}
      label={spec.label}
      keepWhenBlank={keepWhenBlank}
      read={spec.read}
      parse={spec.parse}
      placeholder={spec.placeholder}
      inputMode={spec.inputMode}
      suggestions={spec.suggestions}
      className={className}
    />
  );
}

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? "an" : "a");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type LiveTokenListProps<Draft, Modes> = {
  spec: TokenListSpec<Draft, Modes>;
  /** Shown after the tokens, before the add field (passive Perception after the senses). */
  after?: React.ReactNode;
  /** A list embedded in prose can name the token to add. */
  addLabel?: string;
  /** The tokens' own class. */
  className?: string;
};

/**
 * Each token and its remove button stay together. A trailing field accepts text or a preset.
 *
 * Each token's field and its unapplied text belong to the token, not to its position: removing
 * another token, or Undo, moves the field with its token, and text for a token that is gone is
 * dropped with it. Issue ids still follow the position (`languages.1`), as the validator's paths do.
 */
export function LiveTokenList<Draft, Modes>({ spec, after, className, addLabel = "+ Add" }: LiveTokenListProps<Draft, Modes>): React.ReactElement {
  const edit = useActiveSheetEdit<Draft, Modes>();
  const items = spec.read(edit.draft);
  const keys = tokenKeys(spec, items, edit.draft);
  // The token with this key, wherever it is now.
  const indexOf = (key: string, draft: Draft) => tokenKeys(spec, spec.read(draft), draft).indexOf(key);
  const readToken = (key: string) => (draft: Draft): string | undefined => {
    const index = indexOf(key, draft);
    return index === -1 ? undefined : spec.read(draft)[index];
  };
  const parseToken = (key: string) => (text: string, draft: Draft, modes: Modes): FieldParse<Draft, Modes> => {
    const index = indexOf(key, draft);
    return index === -1 ? fail(`This ${spec.noun} was removed.`) : editToken(spec, draft, modes, index, text);
  };
  // Enter that renames or removes a token remounts or removes its field: focus the field now at
  // that place, or the add field.
  const keepFocusAt = (index: number) => (fromKeyboard: boolean) => {
    if (fromKeyboard) edit.requestLiveFocus(`${spec.id}.${index}`);
  };
  const existing = items.map((token, index) => ({ token, index }));
  const available = spec.suggestions?.filter(option => !tokenProblem(spec, option.value, existing, edit.draft));
  const addField = (
    <LiveInput<Draft, Modes>
      id={spec.id}
      label={`Add ${article(spec.noun)} ${spec.noun}`}
      read={() => ""}
      parse={(text, draft, modes) => editToken(spec, draft, modes, null, text)}
      placeholder={addLabel}
      suggestions={available}
      add
    />
  );
  return (
    <>
      {items.map((_, index) => (
        <span key={keys[index]} className={styles.entry}>
          <LiveInput<Draft, Modes>
            id={`${spec.id}.${index}`}
            bufferKey={`${spec.id}[${keys[index]}]`}
            label={`${capitalize(spec.noun)} ${index + 1}`}
            keepWhenBlank
            read={readToken(keys[index])}
            parse={parseToken(keys[index])}
            onApplied={keepFocusAt(index)}
            suggestions={spec.suggestions}
            className={className}
          />
          <RemoveLiveEntry
            label={`Remove ${spec.noun} ${items[index]}`}
            onRemove={() => commitParse(edit, editToken(spec, edit.draft, edit.modes, index, ""))}
            focusId={`${spec.id}.${index}`}
          />
        </span>
      ))}
      {after}
      {addField}
    </>
  );
}

/** Removing an entry is one undoable edit. Keep focus on this row after its control disappears. */
export const RemoveLiveEntry: React.FC<{
  label: string;
  onRemove: () => string | undefined;
  focusId: string;
  /** Issue target ids that focus this button, for an entry that has no field of its own (a spell chip). */
  targetIds?: readonly string[];
}> = ({ label, onRemove, focusId, targetIds = [] }) => {
  const edit = useActiveSheetEdit();
  const [error, setError] = useState<string>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  useLiveTarget(targetIds, buttonRef);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.remove}
        aria-label={label}
        title={label}
        onMouseDown={event => {
          // A blur could rename and remount the very entry being removed before the click.
          if (event.currentTarget.parentElement?.contains(document.activeElement)) event.preventDefault();
        }}
        onClick={() => {
          if (!edit.claim()) return;
          const problem = onRemove();
          setError(problem);
          if (!problem) edit.requestLiveFocus(focusId);
        }}
      >
        <FiX aria-hidden="true" />
      </button>
      {error && <span className={styles.error} role="alert">{error}</span>}
    </>
  );
};

/** The class a cell puts on its box so its `LiveModeMarker` sits in the corner. */
export const markerHost = styles.markerHost;

export type ModeMarkerLook = "empty" | "filled" | "double" | "other";

type LiveModeMarkerProps = {
  /** What the marker sets, e.g. "Strength save". */
  label: string;
  /** The current mode's name and the one a press changes to, e.g. "proficient" → "expertise". */
  current: string;
  next: string;
  look: ModeMarkerLook;
  onPress: () => void;
  /** After a value in a line of text, instead of in the corner of a `markerHost` cell. */
  inline?: boolean;
};

/**
 * A small corner marker that cycles a value's mode (none, proficient, expertise). It is a button
 * and a tab stop of its own, so the mode is reachable from the keyboard. Like a field, a press
 * first settles any open click-to-edit editor, and does nothing while an invalid one stays open.
 */
export const LiveModeMarker: React.FC<LiveModeMarkerProps> = ({ label, current, next, look, onPress, inline = false }) => {
  const { claim } = useActiveSheetEdit();
  return (
    <button
      type="button"
      className={styles.modeMarker}
      data-look={look}
      data-inline={inline || undefined}
      aria-label={`${label}, ${current}. Change to ${next}`}
      title={`${current} (click to change)`}
      onClick={() => {
        if (claim()) onPress();
      }}
    />
  );
};
