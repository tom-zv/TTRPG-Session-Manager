import React, { useId, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiPlus, FiX } from "react-icons/fi";
import styles from "./DnD5eEntityForm.module.css";

type FieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
  controlId?: string;
  name?: string;
  error?: string;
};

export const Field: React.FC<FieldProps> = ({
  label,
  children,
  className,
  controlId: explicitControlId,
  name,
  error,
}) => {
  const generatedId = useId();
  const controlName = name ?? toFieldName(label);
  const controlId = `${controlName}-${generatedId.replace(/:/g, "")}`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : undefined;
  const childList = React.Children.toArray(children);
  const hasDirectControl = childList.some(
    (child) =>
      React.isValidElement(child) &&
      typeof child.type === "string" &&
      FORM_CONTROL_TAGS.has(child.type)
  );
  const childControlId = childList.find((child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return false;
    return typeof child.props.id === "string";
  });
  const labelControlId =
    explicitControlId ??
    (React.isValidElement<Record<string, unknown>>(childControlId) &&
    typeof childControlId.props.id === "string"
      ? childControlId.props.id
      : hasDirectControl
        ? controlId
        : undefined);

  const enhancedChildren = childList.map((child) => {
    if (!React.isValidElement(child)) {
      return child;
    }

    if (typeof child.type !== "string") {
      return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        "aria-describedby": child.props["aria-describedby"] ?? describedBy,
        "aria-invalid": child.props["aria-invalid"] ?? (Boolean(error) || undefined),
        "data-field": child.props["data-field"] ?? controlName,
        inputClassName: joinClassNames(
          child.props.inputClassName as string | undefined,
          error ? styles.inputError : undefined
        ),
      });
    }

    if (!FORM_CONTROL_TAGS.has(child.type)) {
      return child;
    }

    return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      id: child.props.id ?? controlId,
      name: child.props.name ?? controlName,
      "aria-describedby": child.props["aria-describedby"] ?? describedBy,
      "aria-invalid": child.props["aria-invalid"] ?? (Boolean(error) || undefined),
      "data-field": child.props["data-field"] ?? controlName,
      className: joinClassNames(child.props.className, error ? styles.inputError : undefined),
    });
  });

  return (
    <div className={`${styles.field}${className ? " " + className : ""}`}>
      <label className={styles.label} htmlFor={labelControlId}>
        {label}
      </label>
      {enhancedChildren}
      {error && (
        <div id={errorId} className={styles.fieldError}>
          {error}
        </div>
      )}
    </div>
  );
};

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

export type ComboboxOption = {
  value: string;
  label: string;
};

type ComboboxInputProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboboxOption[];
  id?: string;
  name?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  placeholder?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  className?: string;
  inputClassName?: string;
  clearLabel?: string;
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
    <span className={`${styles.numberStepper}${className ? " " + className : ""}`}>
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

export const ComboboxInput: React.FC<ComboboxInputProps> = ({
  value,
  onChange,
  options,
  id,
  name,
  inputRef,
  placeholder,
  onKeyDown,
  className,
  inputClassName,
  clearLabel = "Clear selected value",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "data-field": dataField,
}) => {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const controlRef = inputRef ?? fallbackRef;
  const listboxId = useId().replace(/:/g, "");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const filteredOptions = options.filter((opt) => {
    if (!value.trim()) return true;
    const query = value.toLowerCase();
    return opt.value.toLowerCase().includes(query) || opt.label.toLowerCase().includes(query);
  });

  const selectOption = (opt: ComboboxOption) => {
    onChange(opt.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const clearValue = () => {
    onChange("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    window.requestAnimationFrame(() => controlRef.current?.focus());
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen && filteredOptions.length > 0) setIsOpen(true);
      setHighlightedIndex((prev) =>
        filteredOptions.length > 0 ? Math.min(prev + 1, filteredOptions.length - 1) : -1
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      selectOption(filteredOptions[highlightedIndex]);
      return;
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <span className={`${styles.comboInput}${className ? " " + className : ""}`}>
      <input
        ref={controlRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && filteredOptions.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={
          highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
        }
        value={value}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        data-field={dataField}
        className={inputClassName}
        autoComplete="off"
      />
      <button
        type="button"
        className={styles.comboClearButton}
        onClick={clearValue}
        disabled={!value}
        aria-label={clearLabel}
        tabIndex={-1}
      >
        <FiX aria-hidden="true" />
      </button>
      {isOpen && filteredOptions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className={styles.comboDropdown}
          aria-label={ariaLabel}
        >
          {filteredOptions.map((opt, index) => (
            <li
              key={opt.value}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={`${styles.comboOption}${index === highlightedIndex ? " " + styles.comboOptionHighlighted : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(opt);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};

type CollapsibleSectionProps = {
  id: string;
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  count,
  isOpen,
  onToggle,
  children,
}) => (
  <section className={styles.section}>
    <button
      type="button"
      className={styles.sectionToggle}
      onClick={() => onToggle(id)}
      aria-expanded={isOpen}
      aria-controls={`${id}-section-body`}
    >
      {isOpen ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
      <span className={styles.sectionTitle}>{title}</span>
      <span className={styles.sectionCountWrap}>
        {count != null && count > 0 && <span className={styles.sectionCount}>{count}</span>}
      </span>
    </button>
    {isOpen && (
      <div id={`${id}-section-body`} className={styles.sectionBody}>
        {children}
      </div>
    )}
  </section>
);

type TagFieldProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  presets?: string[];
  name?: string;
};

export const TagField: React.FC<TagFieldProps> = ({
  label,
  items,
  onChange,
  placeholder,
  presets = [],
  name,
}) => {
  const [value, setValue] = useState("");
  const [presetValue, setPresetValue] = useState("");
  const generatedId = useId();
  const controlName = name ?? toFieldName(label);
  const idSuffix = generatedId.replace(/:/g, "");
  const labelId = `${controlName}-${idSuffix}-label`;
  const inputId = `${controlName}-${idSuffix}-draft`;
  const presetId = `${controlName}-${idSuffix}-preset`;

  const addItem = (nextValue = value) => {
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    const exists = items.some((item) => item.toLowerCase() === trimmed.toLowerCase());
    if (!exists) onChange([...items, trimmed]);
    setValue("");
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const addPreset = () => {
    addItem(presetValue);
    setPresetValue("");
  };

  return (
    <div className={styles.tagField}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={styles.tagList}>
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className={styles.tag}>
            {item}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => removeItem(index)}
              aria-label={`Remove ${item}`}
            >
              <FiX aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.inlineControl}>
        <input
          id={inputId}
          type="text"
          name={`${controlName}-draft`}
          aria-labelledby={labelId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          className={`${styles.toolButton} ${styles.plusButton}`}
          onClick={() => addItem()}
        >
          <FiPlus aria-hidden="true" />
          Add
        </button>
      </div>
      {presets.length > 0 && (
        <div className={styles.presetSelectRow}>
          <select
            id={presetId}
            name={`${controlName}-preset`}
            value={presetValue}
            onChange={(event) => setPresetValue(event.target.value)}
            aria-label={`${label} preset`}
          >
            <option value="">Preset</option>
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.toolButton} ${styles.plusButton}`}
            onClick={addPreset}
            disabled={!presetValue}
          >
            <FiPlus aria-hidden="true" />
            Add Preset
          </button>
        </div>
      )}
    </div>
  );
};



const FORM_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

const toFieldName = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const joinClassNames = (...classes: Array<string | undefined>): string | undefined => {
  const value = classes.filter(Boolean).join(" ");
  return value || undefined;
};

const parseNumber = (value: string): number | undefined => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clampNumber = (value: number, min?: number, max?: number): number => {
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  return value;
};

const formatNumberValue = (value: number, format: "plain" | "signed"): string => {
  if (format === "signed" && value >= 0) return `+${value}`;
  return String(value);
};


