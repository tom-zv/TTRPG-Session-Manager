import React, { useEffect, useRef } from "react";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { capitalize, formatSpellLevelShort } from "./spellFilters.js";
import styles from "./SpellBrowser.module.css";

type SpellListProps = {
  spells: SpellSummary[];
  selectedId: number | null;
  /** "pointer" for a click, "keyboard" for arrow keys. */
  onSelect: (id: number, via: "pointer" | "keyboard") => void;
  /** Enter on the list: move focus to the spell's details. */
  onActivate: () => void;
};

const optionId = (id: number) => `spell-option-${id}`;

export const SpellList: React.FC<SpellListProps> = ({ spells, selectedId, onSelect, onActivate }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId === null) return;
    listRef.current?.querySelector(`#${optionId(selectedId)}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (spells.length === 0) return;
    const index = spells.findIndex(spell => spell.id === selectedId);
    const move = (next: number) => {
      event.preventDefault();
      onSelect(spells[Math.max(0, Math.min(spells.length - 1, next))].id, "keyboard");
    };

    switch (event.key) {
      case "ArrowDown": return move(index < 0 ? 0 : index + 1);
      case "ArrowUp": return move(index < 0 ? 0 : index - 1);
      case "PageDown": return move(index + 10);
      case "PageUp": return move(index - 10);
      case "Home": return move(0);
      case "End": return move(spells.length - 1);
      case "Enter":
        if (selectedId !== null) {
          event.preventDefault();
          onActivate();
        }
    }
  };

  const selectedVisible = spells.some(spell => spell.id === selectedId);

  return (
    <div
      ref={listRef}
      className={styles.list}
      role="listbox"
      aria-label="Spells"
      tabIndex={0}
      aria-activedescendant={selectedVisible && selectedId !== null ? optionId(selectedId) : undefined}
      onKeyDown={handleKeyDown}
    >
      {spells.map(spell => {
        const selected = spell.id === selectedId;
        return (
          <div
            key={spell.id}
            id={optionId(spell.id)}
            role="option"
            aria-selected={selected}
            className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
            // The listbox owns focus and the keyboard (aria-activedescendant); options only take the pointer.
            tabIndex={-1}
            onMouseDown={event => {
              event.preventDefault();
              listRef.current?.focus();
              onSelect(spell.id, "pointer");
            }}
          >
            <span className={styles.rowName}>
              {spell.name}
              {spell.concentration && <abbr className={styles.badge} title="Concentration">C</abbr>}
              {spell.ritual && <abbr className={styles.badge} title="Ritual">R</abbr>}
            </span>
            <span className={styles.rowMeta}>
              <span>{formatSpellLevelShort(spell.level)}</span>
              <span>{capitalize(spell.school)}</span>
              <span>{spell.castingTime}</span>
              <span className={styles.rowComponents}>
                {[spell.components.v && "V", spell.components.s && "S", spell.components.m && "M"].filter(Boolean).join(" ")}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
