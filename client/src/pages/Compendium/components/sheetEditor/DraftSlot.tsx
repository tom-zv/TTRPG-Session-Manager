import React, { useEffect, useRef } from "react";
import browserStyles from "../browser/Browser.module.css";
import { hasOpenInput, type EditorBuffer } from "./SheetEditContext.js";
import styles from "./SheetEditor.module.css";

/** What a browser's draft slot holds that decides whether it is worth keeping. */
export type DraftSlotProgress = {
  state: { dirty: boolean };
  save: { pending: boolean };
  /** The editor left open when the reader unmounted, with its input. */
  buffer: EditorBuffer;
};

/**
 * A slot is kept aside when edit mode ends while it has changes, a save in flight (even of an
 * unchanged new record, so revisiting it cannot send a second one) or input in an open editor.
 */
export const isWorthKeeping = (slot: DraftSlotProgress): boolean =>
  slot.state.dirty || slot.save.pending || hasOpenInput(slot.buffer);

/**
 * Warns before the page unloads while `shouldWarn()` holds. It is read at unload, because typed
 * input reaches the slot's buffer without a render. Listens only while `enabled` (a slot exists).
 */
export const useUnloadWarning = (enabled: boolean, shouldWarn: () => boolean): void => {
  const latest = useRef(shouldWarn);
  useEffect(() => {
    latest.current = shouldWarn;
  });
  useEffect(() => {
    if (!enabled) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);
};

type UnsavedBarProps = {
  /** The draft's record, as the bar names it. */
  name: string;
  onResume: () => void;
  onDiscard: () => void;
};

/** A draft kept aside while another record is shown: "Unsaved changes to <name> · Resume · Discard". */
export const UnsavedBar: React.FC<UnsavedBarProps> = ({ name, onResume, onDiscard }) => (
  <div className={styles.unsavedBar} role="region" aria-label="Unsaved changes">
    <span>Unsaved changes to {name}</span>
    <button type="button" className={browserStyles.secondaryButton} onClick={onResume}>Resume</button>
    <button type="button" className={browserStyles.secondaryButton} onClick={onDiscard}>Discard</button>
  </div>
);
