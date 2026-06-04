import React, { useEffect, useRef } from "react";
import { useEscapeWithin } from "src/pages/EncounterManager/hooks/useEscapeWithin.js";
import styles from "./DnD5eEntityRow.module.css";

type InlineConfirmProps = {
  /** Short question shown before the buttons, e.g. "Remove?". */
  label: string;
  /** Accessible name of the confirm button. */
  confirmLabel: string;
  /** Accessible name of the cancel button. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};

/**
 * Compact in-place confirmation, used instead of `window.confirm`.
 * Focus starts on Cancel so a repeated Enter never confirms by accident; Escape cancels.
 */
export const InlineConfirm: React.FC<InlineConfirmProps> = ({
  label,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  className,
}) => {
  const groupRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEscapeWithin(groupRef, onCancel);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      ref={groupRef}
      className={`${styles.entityRemoveConfirm}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      <span className={styles.confirmText}>{label}</span>
      <button
        type="button"
        className={`${styles.confirmButton} ${styles.confirmYes}`}
        onClick={(event) => {
          event.stopPropagation();
          onConfirm();
        }}
        title={confirmLabel}
        aria-label={confirmLabel}
      >
        ✓
      </button>
      <button
        ref={cancelRef}
        type="button"
        className={`${styles.confirmButton} ${styles.confirmNo}`}
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        title={cancelLabel}
        aria-label={cancelLabel}
      >
        ✕
      </button>
    </div>
  );
};
