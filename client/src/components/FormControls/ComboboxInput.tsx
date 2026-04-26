import React, { useId, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import styles from "./FormControls.module.css";
import { joinClassNames } from "./utils.js";

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

  const filteredOptions = options.filter((option) => {
    if (!value.trim()) return true;
    const query = value.toLowerCase();
    return option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query);
  });

  const selectOption = (option: ComboboxOption) => {
    onChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const clearValue = () => {
    onChange("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    window.requestAnimationFrame(() => controlRef.current?.focus());
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
    <span className={joinClassNames(styles.comboInput, className)}>
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
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
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
        <ul id={listboxId} role="listbox" className={styles.comboDropdown} aria-label={ariaLabel}>
          {filteredOptions.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={joinClassNames(
                styles.comboOption,
                index === highlightedIndex && styles.comboOptionHighlighted
              )}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseUp={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};
