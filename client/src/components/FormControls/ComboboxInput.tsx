import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** An inline sheet value uses its own text sizing and clear/remove action. */
  inline?: boolean;
  onPick?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
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
  inline = false,
  onPick,
  onFocus,
  onBlur,
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
  // The list filters by what the user types, not by the stored value: a filled field opens on every
  // option, so its alternatives stay in view.
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      document.getElementById(`${listboxId}-opt-${highlightedIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, highlightedIndex, listboxId]);

  const query = typed ? value.trim().toLowerCase() : "";
  const filteredOptions = query
    ? options.filter(option => option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query))
    : options;

  const listRef = useRef<HTMLUListElement>(null);
  const expanded = isOpen && filteredOptions.length > 0;
  useLayoutEffect(() => {
    const input = controlRef.current;
    const list = listRef.current;
    if (!inline || !expanded || !input || !list) return;

    // The scroll pane can be narrower than the window. Keep the popup inside both while
    // preserving the inline field's width, even when the user resizes the reader split.
    let pane = input.parentElement;
    while (pane && !/(auto|scroll|hidden|clip)/.test(getComputedStyle(pane).overflowX)) {
      pane = pane.parentElement;
    }
    const place = () => {
      const anchor = input.getBoundingClientRect();
      const bounds = pane?.getBoundingClientRect();
      const left = Math.max(0, bounds?.left ?? 0) + 4;
      const paneRight = pane && bounds ? bounds.left + pane.clientWidth : Infinity;
      const right = Math.min(document.documentElement.clientWidth, paneRight) - 4;
      const above = anchor.top - Math.max(0, bounds?.top ?? 0) - 4;
      const below = Math.min(window.innerHeight, bounds?.bottom ?? Infinity) - anchor.bottom - 4;
      list.style.maxWidth = `min(18rem, ${Math.max(0, right - left)}px)`;
      const x = Math.max(left, Math.min(anchor.left, right - list.offsetWidth));
      list.style.left = `${x - anchor.left}px`;
      const preferredHeight = Math.min(list.scrollHeight, 14 * parseFloat(getComputedStyle(document.documentElement).fontSize));
      const flip = below < preferredHeight && above > below;
      list.style.top = flip ? "auto" : "100%";
      list.style.bottom = flip ? "100%" : "auto";
      list.style.maxHeight = `min(14rem, ${Math.max(0, flip ? above : below)}px)`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(input);
    if (pane) observer.observe(pane);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [inline, expanded, controlRef, value, filteredOptions.length]);

  const closeList = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    setTyped(false);
  };

  const selectOption = (option: ComboboxOption) => {
    (onPick ?? onChange)(option.value);
    closeList();
  };

  const clearValue = () => {
    onChange("");
    closeList();
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

    if (event.key === "ArrowUp" && filteredOptions.length > 0) {
      setIsOpen(true);
      event.preventDefault();
      setHighlightedIndex((prev) => (prev < 0 ? filteredOptions.length - 1 : Math.max(prev - 1, 0)));
      return;
    }

    if (event.key === "Enter" && isOpen && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      selectOption(filteredOptions[highlightedIndex]);
      return;
    }

    if (event.key === "Escape" && expanded) {
      if (inline) onKeyDown?.(event);
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      closeList();
      return;
    }

    onKeyDown?.(event);
    if (event.key === "Enter" && event.defaultPrevented) closeList();
  };

  return (
    <span className={joinClassNames(inline ? styles.comboInline : styles.comboInput, className)}>
      <input
        ref={controlRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={
          isOpen && filteredOptions[highlightedIndex] ? `${listboxId}-opt-${highlightedIndex}` : undefined
        }
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
          setTyped(true);
        }}
        onFocus={() => {
          // An empty field offers its options at once; a filled one waits for a click, a key or typing,
          // so tabbing (or a focus moved after a removal) does not open a list on every field.
          if (!value) setIsOpen(true);
          onFocus?.();
        }}
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          onBlur?.();
          closeList();
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
      {!inline && (
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
      )}
      {expanded && (
        <ul ref={listRef} id={listboxId} role="listbox" className={styles.comboDropdown} aria-label={ariaLabel}>
          {filteredOptions.map((option, index) => (
            // Keyboard focus stays on the input. Arrow keys and Enter select the active option.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
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
              onClick={(event) => {
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
