import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { commitParse, type FieldParse } from "../fieldSpec.js";
import { useActiveSheetEdit } from "../SheetEditContext.js";
import { useLiveTarget } from "./LiveField.js";
import { useReferenceMenu } from "./ReferenceMenu.js";
import { RichText } from "../../RichText/RichText.js";
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
  /**
   * Run-in text that continues the line before it (an entry's bold name), as inline rich text.
   * Open, the input's first line starts where that line's text ends.
   */
  inline?: boolean;
  /** The class the sheet gives this text in view mode, so it reads the same while edited. */
  className?: string;
};

/**
 * Rich text in edit mode, in place. Closed, it is the text as the sheet shows it, tinted to say it
 * can be edited; a click or focus opens it into a borderless input of its source (tags as written)
 * in the same font, which grows with the text. The input is mounted while closed too, visually
 * hidden, so Tab, issue jumps and focus requests reach it. It stays open while it has focus or
 * holds unapplied or invalid text. Typing `{` opens the reference menu under it (`ReferenceMenu.tsx`).
 * Drawn the same in both presentations. Like a live field, blur commits, the first Escape closes the
 * menu or else reverts, invalid text stays with its message, and unapplied text is kept in the
 * editor buffer so Resume, a remount or Save still finds it.
 */
export function LiveSourceText<Draft, Modes>({
  id, bufferKey = id, label, read, parse, placeholder, inline = false, className,
}: LiveSourceTextProps<Draft, Modes>): React.ReactElement {
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
  const [focused, setFocused] = useState(false);
  const open = focused || text !== value || error !== null;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Run-in: an empty mark where the line before ends, so the input's first line can start there.
  const markRef = useRef<HTMLSpanElement>(null);
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

  // Open, the input grows with its text instead of scrolling it, also when a resize rewraps the
  // text. A run-in input's first line is indented to where the line before it ends. Runs after
  // every render: the line before can change width without this field changing.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area || !open) return undefined;
    const fit = () => {
      const mark = markRef.current;
      const indent = mark ? Math.max(0, mark.getBoundingClientRect().left - area.getBoundingClientRect().left) : 0;
      // The stylesheet indents the first line by this and starts the tint there, so the line's
      // name is not drawn as part of the text.
      area.style.setProperty("--source-indent", `${indent}px`);
      area.style.height = "auto";
      if (area.scrollHeight > 0) area.style.height = `${area.scrollHeight}px`;
      // On one line the underline also starts after the name.
      const oneLine = area.scrollHeight < parseFloat(getComputedStyle(area).lineHeight) * 1.5;
      area.style.setProperty("--source-underline-start", oneLine ? `${indent}px` : "0px");
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
  });

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

  // A press on the shown text opens the input with the caret at the end, as a live field's first click does.
  const openFromPointer = (event: React.MouseEvent) => {
    const area = areaRef.current;
    if (event.button !== 0 || !area) return;
    event.preventDefault();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  };

  const Box = inline ? "span" : "div";
  return (
    <Box className={`${styles.source} ${inline ? styles.sourceInline : ""} ${className ?? ""}`} data-open={open || undefined} data-invalid={error !== null || undefined}>
      {!open && (
        // The input is the keyboard path (it opens on focus); this is the same for a pointer.
        <Box className={styles.sourcePreview} aria-hidden="true" onMouseDown={openFromPointer}>
          {value.trim()
            ? <RichText text={value} inline={inline} />
            : <span className={styles.sourcePlaceholder}>{placeholder ?? label}</span>}
        </Box>
      )}
      {open && inline && <span ref={markRef} aria-hidden="true">{"\u200b"}</span>}
      <textarea
        ref={areaRef}
        className={open ? styles.sourceText : styles.srOnly}
        {...menu.areaProps}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        placeholder={placeholder}
        rows={1}
        value={text}
        onFocus={event => {
          setFocused(true);
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
          setFocused(false);
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
      <span role="status" className={styles.srOnly} aria-label="Reference menu status" aria-live="polite" aria-atomic="true">
        {menu.announcement}
      </span>
      {/* Overlays under the text, its full width: the menu and a message move nothing. */}
      {menu.menu}
      {error && <span id={errorId} role="alert" className={styles.sourceError}>{error}</span>}
    </Box>
  );
}
