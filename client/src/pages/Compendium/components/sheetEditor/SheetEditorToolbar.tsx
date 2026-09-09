import React, { useId, useRef, type RefObject } from "react";
import { FiRotateCcw, FiRotateCw } from "react-icons/fi";
import type { PlacedIssue } from "./issues.js";
import styles from "./SheetEditor.module.css";

export type HistoryStep = "undo" | "redo";

type HistoryOptions = {
  saving: boolean;
  /** Commits and closes the open editor; false keeps an invalid one open, and the step does not happen. */
  settle: () => boolean;
  /** Steps the draft's history. */
  apply: (type: HistoryStep) => void;
};

export type SheetHistory = {
  step: (type: HistoryStep) => void;
  undoRef: RefObject<HTMLButtonElement | null>;
  redoRef: RefObject<HTMLButtonElement | null>;
};

/** Undo and Redo from the toolbar or the keyboard, settling the open editor first. */
export const useSheetHistory = ({ saving, settle, apply }: HistoryOptions): SheetHistory => {
  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);
  const step = (type: HistoryStep) => {
    if (saving) return;
    if (!settle()) return;
    apply(type);
    // A step can remove the focused control (an added entry, an open card). Focus then goes to the
    // history button that is certainly enabled now: Redo after Undo, Undo after Redo.
    window.setTimeout(() => {
      if (document.activeElement === null || document.activeElement === document.body) {
        (type === "undo" ? redoRef : undoRef).current?.focus();
      }
    }, 0);
  };
  return { step, undoRef, redoRef };
};

const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);

type EditorKeyOptions = {
  step: (type: HistoryStep) => void;
  /** A confirm is open, and Escape dismisses it. */
  confirming: boolean;
  dismissConfirm: () => void;
  /** The sheet is inside the narrow dialog with an editor open: Escape closes the editor, not the dialog. */
  captureEscape: boolean;
  closeEditor: () => void;
};

/** The edit mode's keys, for the element that wraps the toolbar and the sheet. */
export const handleSheetEditorKeyDown = (
  event: React.KeyboardEvent<HTMLElement>,
  { step, confirming, dismissConfirm, captureEscape, closeEditor }: EditorKeyOptions,
): void => {
  if (!event.currentTarget.contains(event.target as Node)) return;
  // Undo and Redo over committed edits; text fields keep their own undo.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z" && !isEditableElement(event.target)) {
    event.preventDefault();
    step(event.shiftKey ? "redo" : "undo");
    return;
  }
  if (event.key === "Escape" && confirming) {
    event.preventDefault();
    event.stopPropagation();
    dismissConfirm();
    return;
  }
  if (!captureEscape || event.key !== "Escape") return;
  // Catch Escape from controls anywhere in the sheet before it reaches the narrow dialog.
  event.preventDefault();
  event.stopPropagation();
  closeEditor();
};

type SheetEditorToolbarProps = {
  title: React.ReactNode;
  /** "Editing", or what a new record is called ("New item"). */
  heading: string;
  dirty: boolean;
  /** Committed edits since edit mode started (the undo history). */
  changes: number;
  issues: readonly PlacedIssue[];
  issuesOpen: boolean;
  onToggleIssues: () => void;
  /** An issue's jump: opens (or focuses) the editor that fixes it. */
  onOpenIssue: (targetId: string, focusId: string | null) => void;
  /** Shown as an alert under the toolbar: why the last save failed. */
  alert: string | null;
  saving: boolean;
  /**
   * Live fields holding text that did not apply; Save waits for them (the editor's `canSave`). The
   * notice's room is kept from the start of edit mode, so the notice appearing moves nothing.
   */
  unapplied?: number;
  canSave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onStep: SheetHistory["step"];
  undoRef: SheetHistory["undoRef"];
  redoRef: SheetHistory["redoRef"];
  onCancel: () => void;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onSave: () => void;
  /** Cancel with changes asks first; null while it is not asking. */
  confirmDiscard: {
    name: string;
    onDiscard: () => void;
    onKeep: () => void;
  } | null;
  /** "Keep editing" in the discard confirm, which takes focus when it opens. */
  keepRef: RefObject<HTMLButtonElement | null>;
  /** The record type's own toolbar items, before Undo. */
  children?: React.ReactNode;
};

/**
 * The edit mode's toolbar (changes, issues, Undo and Redo, Cancel, Save), then the discard confirm,
 * the save alert and the issues list.
 */
export const SheetEditorToolbar: React.FC<SheetEditorToolbarProps> = ({
  title, heading, dirty, changes, issues, issuesOpen, onToggleIssues, onOpenIssue, alert, saving, unapplied = 0, canSave, canUndo, canRedo,
  onStep, undoRef, redoRef, onCancel, cancelRef, onSave, confirmDiscard, keepRef, children,
}) => {
  const issuesId = useId();
  return (
    <>
      <div className={styles.editHeading}>
        {title}
        <div className={styles.toolbar} role="toolbar" aria-label="Editing">
          <span>
            {heading}
            {/* After a partial save, Undo can return to the loaded values, which are no longer stored. */}
            {dirty ? (changes > 0 ? ` · ${changes} ${changes === 1 ? "change" : "changes"}` : " · unsaved changes") : ""}
          </span>
          {issues.length > 0 && (
            <button
              type="button"
              className={styles.issuesButton}
              aria-expanded={issuesOpen}
              aria-controls={issuesId}
              onClick={onToggleIssues}
            >
              {issues.length} {issues.length === 1 ? "issue" : "issues"}
            </button>
          )}
          {children}
          <p className={styles.unapplied}>
            {/* The longest the notice reads, hidden: it sizes the reserved room. */}
            <span className={styles.unappliedSizer} aria-hidden="true">99 fields hold unapplied text</span>
            {unapplied > 0 && <span>{unapplied} {unapplied === 1 ? "field holds" : "fields hold"} unapplied text</span>}
          </p>
          <button ref={undoRef} type="button" disabled={saving || !canUndo} onClick={() => onStep("undo")} aria-keyshortcuts="Control+Z" aria-label="Undo" title="Undo (Ctrl/⌘ Z)"><FiRotateCcw aria-hidden="true" /></button>
          <button ref={redoRef} type="button" disabled={saving || !canRedo} onClick={() => onStep("redo")} aria-keyshortcuts="Control+Shift+Z" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)"><FiRotateCw aria-hidden="true" /></button>
          <button ref={cancelRef} type="button" disabled={saving} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={styles.save}
            disabled={!canSave}
            onMouseDown={event => {
              // The inline field's blur can commit and move Save before mouseup. Save already
              // settles that field on click, so keep focus in it until the click completes.
              if (event.button === 0 && document.activeElement?.classList.contains(styles.inlineInput)) {
                event.preventDefault();
              }
            }}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {confirmDiscard && (
        <div className={styles.confirm} role="group" aria-label="Discard unsaved changes?">
          <p>Discard the unsaved changes to {confirmDiscard.name}?</p>
          <button type="button" onClick={confirmDiscard.onDiscard}>Discard changes</button>
          <button ref={keepRef} type="button" onClick={confirmDiscard.onKeep}>Keep editing</button>
        </div>
      )}
      {alert && <p role="alert" className={styles.error}>{alert}</p>}
      {issuesOpen && issues.length > 0 && (
        <ul id={issuesId} className={styles.issues} aria-label="Issues">
          {issues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>
              {issue.targetId ? (
                <button type="button" data-sheet-issue="" onClick={() => onOpenIssue(issue.targetId!, issue.focusId)}>
                  {issue.place}: {issue.message}
                </button>
              ) : (
                <span>{issue.place}: {issue.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
