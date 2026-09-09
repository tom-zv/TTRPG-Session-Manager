import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { commitParse, type FieldParse } from "../fieldSpec.js";
import { useActiveSheetEdit } from "../SheetEditContext.js";
import { useLiveTarget } from "./LiveField.js";
import { useReferenceMenu } from "./ReferenceMenu.js";
import styles from "./LiveFields.module.css";

type LiveSourceTextProps<Draft, Modes> = {
  /** The issue target id. */
  id: string;
  /** Where its unapplied text is kept in the editor buffer; `id` unless the id can move (an entry's index). */
  bufferKey?: string;
  label: string;
  /** The source in a draft, or undefined once the field is gone; pure, so pending text can outlive the field. */
  read: (draft: Draft, modes: Modes) => string | undefined;
  parse: (text: string, draft: Draft, modes: Modes) => FieldParse<Draft, Modes>;
  placeholder?: string;
};

/**
 * Rich text in edit mode: an auto-growing textarea of its source (tags as written), in place.
 * Typing `{` opens the reference menu under it (`ReferenceMenu.tsx`). Drawn the same in both
 * presentations. Like a live
 * field, blur commits, the first Escape closes the menu or else reverts, invalid text stays with
 * its message, and unapplied text is kept in the editor buffer so Resume, a remount or Save still
 * finds it.
 */
export function LiveSourceText<Draft, Modes>({ id, bufferKey = id, label, read, parse, placeholder }: LiveSourceTextProps<Draft, Modes>): React.ReactElement {
  const edit = useActiveSheetEdit<Draft, Modes>();
  const { buffer, viewer } = edit;
  const value = read(edit.draft, edit.modes) ?? "";
  const [restored] = useState(() => buffer?.restoreLive(bufferKey));
  const [text, setText] = useState(restored?.text ?? value);
  const [error, setError] = useState<string | null>(restored?.error ?? null);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
    setError(null);
  }
  const kept = buffer?.restoreLive(bufferKey);
  const keptError = kept && kept.text === text ? kept.error : null;
  const [seenKeptError, setSeenKeptError] = useState(keptError);
  if (keptError !== seenKeptError) {
    setSeenKeptError(keptError);
    if (keptError !== null) setError(keptError);
  }
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const claim = useLiveTarget([id], areaRef);
  const fieldRef = useRef({ read, parse });
  useEffect(() => {
    fieldRef.current = { read, parse };
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

  // The textarea grows with its text instead of scrolling it, also when a resize rewraps the text.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const fit = () => {
      area.style.height = "auto";
      if (area.scrollHeight > 0) area.style.height = `${area.scrollHeight + 2}px`;
    };
    fit();
    let width = area.clientWidth;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === width) return;
      width = area.clientWidth;
      fit();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [text]);

  const commit = (typed = text) => {
    if (typed === value) {
      setError(null);
      return;
    }
    if (!claim()) return;
    const problem = commitParse(edit, parse(typed, edit.draft, edit.modes));
    if (problem) {
      setError(problem);
      return;
    }
    buffer?.forgetLive(bufferKey);
    setError(null);
  };

  const menu = useReferenceMenu({
    text,
    areaRef,
    viewer,
    onEdit: typed => {
      setText(typed);
      setError(null);
    },
  });

  return (
    <div className={styles.source} data-invalid={error !== null || undefined}>
      <div className={styles.sourceField}>
        <textarea
          ref={areaRef}
          className={styles.sourceText}
          {...menu.areaProps}
          aria-label={label}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          rows={3}
          value={text}
          onFocus={event => {
            menu.track.onFocus(event.currentTarget);
            void claim();
          }}
          onChange={event => {
            setText(event.target.value);
            setError(null);
            menu.track.onChange(event.currentTarget);
          }}
          onSelect={event => menu.track.onCaret(event.currentTarget)}
          onKeyUp={event => menu.track.onCaret(event.currentTarget)}
          onClick={event => menu.track.onCaret(event.currentTarget)}
          onBlur={() => {
            menu.track.onBlur();
            commit();
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (menu.onKeyDown(event)) return;
            if (event.key === "Escape" && (text !== value || error)) {
              event.preventDefault();
              event.stopPropagation();
              setText(value);
              setError(null);
            }
          }}
        />
        <div role="status" className={styles.srOnly} aria-label="Reference menu status" aria-live="polite" aria-atomic="true">
          {menu.announcement}
        </div>
        {/* An overlay under the text, its full width: opening it moves nothing. */}
        {menu.menu}
      </div>
      {/* A slot that is there whether or not it holds a message, so a message moves nothing. */}
      <div className={styles.sourceMessage}>
        {error && <p id={errorId} role="alert" className={styles.sourceError}>{error}</p>}
      </div>
    </div>
  );
}
