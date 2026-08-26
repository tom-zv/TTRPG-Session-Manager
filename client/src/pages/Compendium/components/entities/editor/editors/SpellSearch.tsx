import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SpellEntry } from "shared/domain/encounters/dnd5e/entity.js";
import { ComboboxInput } from "src/components/FormControls/ComboboxInput.js";
import { useSpellIndex } from "../../../../api/query/useSpellQueries.js";

/** Matches shown at once; typing narrows them. */
const MAX_MATCHES = 12;
const optionValue = (name: string, source: string) => `${name}|${source}`;

type SpellSearchProps = {
  /** Accessible name of the input, e.g. "Spell to insert". */
  label: string;
  /** A spell from the index, with its source, or a name the index does not know (no source). */
  onPick: (spell: SpellEntry) => void;
  /** Lets Enter add a name the index does not know, as a homebrew spell may be. */
  allowUnknown?: boolean;
  /** Escape with no suggestions open. Without it the key reaches the card, which discards. */
  onEscape?: () => void;
  /** Focus the input when it appears, because the GM just asked for it. */
  focusOnMount?: boolean;
};

/**
 * A spell-index autocomplete. Picking a suggestion gives its name and source, so the reference
 * resolves to that printing ("Fireball (XPHB)") rather than to whichever comes first.
 */
export const SpellSearch: React.FC<SpellSearchProps> = ({ label, onPick, allowUnknown = false, onEscape, focusOnMount = false }) => {
  const index = useSpellIndex();
  const [text, setText] = useState("");
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focusOnMount) rootRef.current?.querySelector("input")?.focus();
  }, [focusOnMount]);
  const query = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    const spells = index.data ?? [];
    const starts = spells.filter(spell => spell.name.toLowerCase().startsWith(query));
    const contains = spells.filter(spell => !spell.name.toLowerCase().startsWith(query) && spell.name.toLowerCase().includes(query));
    return [...starts, ...contains].slice(0, MAX_MATCHES);
  }, [index.data, query]);
  const options = matches.map(spell => ({ value: optionValue(spell.name, spell.source), label: `${spell.name} (${spell.source})` }));

  const pick = (spell: SpellEntry) => {
    onPick(spell);
    setText("");
  };

  return (
    // With no suggestions shown, Escape closes the search; the combobox would only close its empty list.
    <span
      ref={rootRef}
      onKeyDownCapture={event => {
        if (event.key !== "Escape" || !onEscape || options.length > 0) return;
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }}
    >
      <ComboboxInput
      aria-label={label}
      value={text}
      options={options}
      placeholder="Search spells"
      onChange={value => {
        const chosen = matches.find(spell => optionValue(spell.name, spell.source) === value);
        if (chosen) pick({ name: chosen.name, source: chosen.source });
        else setText(value);
      }}
      onKeyDown={event => {
        if (event.key === "Enter") {
          // Enter picks here; it must not submit the card.
          event.preventDefault();
          const exact = matches.filter(spell => spell.name.toLowerCase() === query);
          if (exact.length === 1) pick({ name: exact[0].name, source: exact[0].source });
          else if (allowUnknown && query && exact.length === 0) pick({ name: text.trim() });
        } else if (event.key === "Escape" && onEscape) {
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        }
      }}
    />
    </span>
  );
};
