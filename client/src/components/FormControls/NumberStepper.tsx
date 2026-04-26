import React from "react";
import styles from "./FormControls.module.css";
import { clampNumber, formatNumberValue, joinClassNames, parseNumber } from "./utils.js";

type NumberStepperProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  className?: string;
  inputClassName?: string;
  format?: "plain" | "signed";
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "data-field"?: string;
};

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  id,
  name,
  min,
  max,
  step = 1,
  disabled = false,
  required = false,
  placeholder,
  onKeyDown,
  className,
  inputClassName,
  format = "plain",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "data-field": dataField,
}) => {
  const changeBy = (direction: 1 | -1) => {
    const currentValue = parseNumber(value);
    const nextBase = currentValue ?? 0;
    const nextValue = clampNumber(nextBase + step * direction, min, max);
    onChange(formatNumberValue(nextValue, format));
  };

  return (
    <span className={joinClassNames(styles.numberStepper, className)}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          const parsed = parseNumber(value);
          if (format === "signed" && parsed != null) {
            onChange(formatNumberValue(clampNumber(parsed, min, max), format));
          }
        }}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        data-field={dataField}
        className={inputClassName}
      />
      <span className={styles.numberStepperButtons} aria-hidden={disabled ? "true" : undefined}>
        <button
          type="button"
          tabIndex={disabled ? -1 : 0}
          disabled={disabled}
          onClick={() => changeBy(1)}
          aria-label={ariaLabel ? `Increase ${ariaLabel}` : "Increase value"}
        >
          +
        </button>
        <button
          type="button"
          tabIndex={disabled ? -1 : 0}
          disabled={disabled}
          onClick={() => changeBy(-1)}
          aria-label={ariaLabel ? `Decrease ${ariaLabel}` : "Decrease value"}
        >
          -
        </button>
      </span>
    </span>
  );
};
