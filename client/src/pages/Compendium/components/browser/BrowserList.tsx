import React, { useEffect, useRef } from "react";
import styles from "./Browser.module.css";

export type SelectVia = "pointer" | "keyboard";

type BrowserListProps<Item> = {
  items: readonly Item[];
  getId: (item: Item) => number;
  /** The row's visible content. Use the shared `rowName` / `rowMeta` classes for the usual two lines. */
  renderRow: (item: Item) => React.ReactNode;
  /** The listbox's accessible name, e.g. "Spells". */
  label: string;
  /** Prefix for option element IDs; unique per browser on the page, e.g. "spell-option". */
  idPrefix: string;
  selectedId: number | null;
  /** "pointer" for a click or tap, "keyboard" for arrow, Page, Home and End keys. */
  onSelect: (id: number, via: SelectVia) => void;
  /** Enter on the list with a selection: open its details. */
  onActivate: () => void;
};

const PAGE_STEP = 10;

/**
 * A single-select listbox. The list owns focus and the keyboard (aria-activedescendant);
 * options only take the pointer.
 */
export const BrowserList = <Item,>({
  items,
  getId,
  renderRow,
  label,
  idPrefix,
  selectedId,
  onSelect,
  onActivate,
}: BrowserListProps<Item>) => {
  const listRef = useRef<HTMLDivElement>(null);
  const optionId = (id: number) => `${idPrefix}-${id}`;
  const selectedOptionId = selectedId === null ? null : optionId(selectedId);

  useEffect(() => {
    if (selectedOptionId === null) return;
    listRef.current?.querySelector(`#${selectedOptionId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedOptionId]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (items.length === 0) return;
    const index = items.findIndex(item => getId(item) === selectedId);
    const move = (next: number) => {
      event.preventDefault();
      onSelect(getId(items[Math.max(0, Math.min(items.length - 1, next))]), "keyboard");
    };

    switch (event.key) {
      case "ArrowDown": return move(index < 0 ? 0 : index + 1);
      case "ArrowUp": return move(index < 0 ? 0 : index - 1);
      case "PageDown": return move(index + PAGE_STEP);
      case "PageUp": return move(index - PAGE_STEP);
      case "Home": return move(0);
      case "End": return move(items.length - 1);
      case "Enter":
        if (selectedId !== null) {
          event.preventDefault();
          onActivate();
        }
    }
  };

  const selectedVisible = items.some(item => getId(item) === selectedId);

  return (
    <div
      ref={listRef}
      className={styles.list}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={selectedVisible && selectedOptionId !== null ? selectedOptionId : undefined}
      onKeyDown={handleKeyDown}
    >
      {items.map(item => {
        const id = getId(item);
        const selected = id === selectedId;
        return (
          <div
            key={id}
            id={optionId(id)}
            role="option"
            aria-selected={selected}
            className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
            tabIndex={-1}
            onMouseDown={event => {
              event.preventDefault();
              listRef.current?.focus();
              onSelect(id, "pointer");
            }}
          >
            {renderRow(item)}
          </div>
        );
      })}
    </div>
  );
};
