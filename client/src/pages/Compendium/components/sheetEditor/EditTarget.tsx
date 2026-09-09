import React, { useEffect, useId, useRef } from "react";
import { Popover } from "src/components/Popover/Popover.js";
import { useSheetEdit } from "./SheetEditContext.js";
import styles from "./SheetEditor.module.css";

type EditTargetProps = {
  /** Stable id of this target; `open(id)` on the edit context opens it. */
  id: string;
  /** The accessible name without the verb: "Armor Class, 12" becomes the button "Edit Armor Class, 12". */
  label: string;
  /** Inline editors replace the value; popover editors open beside it (inline under it on narrow screens). */
  kind?: "inline" | "popover";
  /** An absent value: a dashed "+ label" row in place of the value. */
  placeholder?: boolean;
  /** The editor, mounted while this target is open. */
  editor?: React.ReactNode;
  /** Opens another target's editor instead of its own, for a placeholder that adds to a value shown elsewhere. */
  opens?: string;
  /** The value as view mode shows it. */
  children?: React.ReactNode;
};

/**
 * One editable spot on the sheet. In view mode it renders its children untouched. In edit mode the
 * value becomes a button that opens its editor.
 */
export const EditTarget: React.FC<EditTargetProps> = ({ id, label, kind = "popover", placeholder = false, editor, opens, children }) => {
  const edit = useSheetEdit();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  const panelId = useId();
  const active = edit?.activeId === id;

  useEffect(() => {
    if (!edit) return;
    if (wasActive.current && !active && edit.takeFocus(id)) triggerRef.current?.focus();
    wasActive.current = active;
  });

  if (!edit) return placeholder ? null : <>{children}</>;
  if (active && kind === "inline") return <>{editor}</>;

  const trigger = placeholder ? (
    <button ref={triggerRef} type="button" className={styles.placeholder} aria-expanded={active} onClick={() => edit.open(opens ?? id)}>
      + {label}
    </button>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      className={styles.target}
      aria-label={`Edit ${label}`}
      aria-expanded={active}
      onClick={() => edit.open(opens ?? id)}
    >
      {children}
    </button>
  );

  return (
    <>
      {trigger}
      {active && (edit.narrow ? (
        <div
          role="group"
          aria-label={`Edit ${label}`}
          className={styles.inlinePanel}
        >
          {editor}
        </div>
      ) : (
        <Popover
          id={panelId}
          label={`Edit ${label}`}
          anchorRef={triggerRef}
          className={styles.popoverPanel}
          onClose={(returnFocus, outsideTarget) => {
            // An issue jump handles the open editor itself, including a jump within the same group.
            if (outsideTarget instanceof Element && outsideTarget.closest("[data-sheet-issue]")) return;
            // Escape discards; a press outside keeps a valid edit, and an invalid one stays open.
            if (returnFocus) edit.close(true);
            else if (edit.commitRef.current?.() !== false) edit.close();
          }}
        >
          {editor}
        </Popover>
      ))}
    </>
  );
};
