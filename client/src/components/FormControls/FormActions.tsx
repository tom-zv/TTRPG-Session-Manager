import React from "react";
import styles from "./FormControls.module.css";
import { joinClassNames } from "./utils.js";

type FormActionsProps = {
  submitLabel: React.ReactNode;
  isSubmitting?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  className?: string;
};

export const FormActions: React.FC<FormActionsProps> = ({
  submitLabel,
  isSubmitting = false,
  onCancel,
  cancelLabel = "Cancel",
  className,
}) => (
  <div className={joinClassNames(styles.formActions, className)}>
    {onCancel && (
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={onCancel}
        disabled={isSubmitting}
      >
        {cancelLabel}
      </button>
    )}
    <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
      {submitLabel}
    </button>
  </div>
);
