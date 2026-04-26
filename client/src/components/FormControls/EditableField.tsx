import React, { useEffect, useRef, useState } from "react";
import styles from "./FormControls.module.css";
import { clampNumber, joinClassNames, parseNumber } from "./utils.js";

// ---------- String variant ----------

type StringEditableProps = {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "url" | "email" | "password";
  multiline?: boolean;
  rows?: number;
  label?: string;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
};

// ---------- Number variant ----------

type NumberEditableProps = {
  value: number;
  onChange: (value: number) => void;
  type: "number";
  min?: number;
  max?: number;
  label?: string;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  /** Single click to edit (default) vs double-click */
  activateOn?: "click" | "dblclick";
};

export type EditableFieldProps = (StringEditableProps | NumberEditableProps) & {
  /** Hides the edit icon and label; field still activates on click/dblclick */
  compact?: boolean;
};

/**
 * Inline editable field. Displays a read-only value that activates an input on
 * click (or double-click for the `number` type).
 */
export const EditableField: React.FC<EditableFieldProps> = (props) => {
  const {
    value,
    label,
    placeholder,
    className,
    compact = false,
    displayClassName,
    inputClassName,
  } = props;
  const isNumber = props.type === "number";
  const activateOn = isNumber ? ((props as NumberEditableProps).activateOn ?? "dblclick") : "click";

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if ("select" in el) (el as HTMLInputElement).select();
    }
  }, [isEditing]);

  const commit = () => {
    if (isNumber) {
      const p = props as NumberEditableProps;
      const parsed = parseNumber(draft);
      if (parsed != null) {
        p.onChange(clampNumber(parsed, p.min, p.max));
      }
    } else {
      const p = props as StringEditableProps;
      p.onChange(draft);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(String(value));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      cancel();
      return;
    }
    const isMultiline = !isNumber && (props as StringEditableProps).multiline;
    if (e.key === "Enter" && !isMultiline) {
      commit();
    }
  };

  const activate = () => {
    setDraft(String(value));
    setIsEditing(true);
  };

  const displayValue = String(value);
  const contentClassName = joinClassNames(
    styles.editableFieldContent,
    compact && styles.editableFieldContentCompact
  );

  if (isEditing) {
    const isMultiline = !isNumber && (props as StringEditableProps).multiline;
    const rows = (!isNumber && (props as StringEditableProps).rows) || 3;

    return (
      <div className={joinClassNames(compact ? undefined : styles.editableField, className)}>
        {!compact && label && <div className={styles.editableFieldLabel}>{label}</div>}
        <div className={contentClassName}>
          {isMultiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              rows={rows}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className={joinClassNames(styles.editableFieldInput, inputClassName)}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={isNumber ? "text" : (props as StringEditableProps).type ?? "text"}
              inputMode={isNumber ? "numeric" : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className={joinClassNames(styles.editableFieldInput, inputClassName)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={joinClassNames(compact ? undefined : styles.editableField, className)}>
      {!compact && label && <div className={styles.editableFieldLabel}>{label}</div>}
      <div className={contentClassName}>
        <div
          className={joinClassNames(styles.editableFieldDisplay, displayClassName)}
          role="button"
          tabIndex={0}
          onClick={activateOn === "click" ? activate : undefined}
          onDoubleClick={activateOn === "dblclick" ? activate : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") activate();
          }}
          title={activateOn === "dblclick" ? "Double-click to edit" : undefined}
        >
          <span className={styles.editableFieldText}>
            {displayValue || (
              <span className={styles.editableFieldPlaceholder}>
                {placeholder ?? (label ? `Click to edit ${label.toLowerCase()}` : "Click to edit")}
              </span>
            )}
          </span>
          {!compact && <span className={styles.editableFieldIcon}>✎</span>}
        </div>
      </div>
    </div>
  );
};
