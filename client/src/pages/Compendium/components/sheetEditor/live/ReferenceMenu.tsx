import React, { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ItemSummary } from "shared/domain/dnd5e/item.js";
import type { ItemViewer } from "../../../api/query/itemKeys.js";
import { formatItemLink } from "../../items/itemFormat.js";
import { useItemMatches } from "../../items/useItemMatches.js";
import { useSpellMatches, type SpellMatch } from "../useSpellMatches.js";
import {
  findReferenceRun,
  lockReferenceType,
  referenceTag,
  replaceReferenceRun,
  type ReferenceType,
  type TextEdit,
} from "./referenceTrigger.js";
import styles from "./LiveFields.module.css";

/** Rows shown at once; typing narrows them. */
const MAX_ROWS = 8;
const TYPE_LABELS: Record<ReferenceType, string> = { spell: "Spell", item: "Item" };

type Row =
  | { kind: "type"; type: ReferenceType; label: string }
  | { kind: "spell"; spell: SpellMatch; label: string }
  | { kind: "unknown"; name: string; label: string }
  | { kind: "item"; item: ItemSummary; label: string; meta?: string }
  /** Holds the rows' place (searching, nothing found); never highlighted or picked. */
  | { kind: "status"; label: string };

type ReferenceMenuOptions = {
  text: string;
  /** Applies an edit the menu makes to the text (a locked type or a picked tag). */
  onEdit: (text: string) => void;
  areaRef: RefObject<HTMLTextAreaElement | null>;
  /** The signed-in viewer for the item search; without one only spells are offered. */
  viewer?: ItemViewer;
};

/**
 * The `{` reference menu of a rich-text source field. It is part of the field, not an editor of the
 * sheet: it never opens or closes the sheet's editor, and the typed run is ordinary unapplied text.
 * Whether it shows follows from the text and the caret alone (`findReferenceRun`), plus Escape,
 * which closes it until the text changes or the caret leaves the run. Focus stays in the textarea,
 * which is the combobox; the rows are a listbox under it.
 */
export function useReferenceMenu({ text, onEdit, areaRef, viewer }: ReferenceMenuOptions) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const found = focused ? findReferenceRun(text, caret) : null;
  if (!found && dismissed !== null) setDismissed(null);
  const run = found && found.start !== dismissed ? found : null;

  const searching = run?.stage === "search" ? run : null;
  const spellQuery = searching?.type === "spell" ? searching.query.trim() : "";
  const itemQuery = searching?.type === "item" ? searching.query.trim() : "";
  const spells = useSpellMatches(spellQuery, MAX_ROWS, { enabled: searching?.type === "spell" });
  const items = useItemMatches(viewer, itemQuery, { limit: MAX_ROWS });

  const rows: Row[] = [];
  if (run?.stage === "type") {
    for (const type of run.types) if (type === "spell" || viewer) rows.push({ kind: "type", type, label: TYPE_LABELS[type] });
  } else if (searching?.type === "spell") {
    if (!spellQuery) rows.push({ kind: "status", label: "Type a spell name" });
    else if (!spells.ready) rows.push({ kind: "status", label: "Searching…" });
    else {
      // A name the index does not know may still be meant (a homebrew spell): offer it as written.
      const unknown = spells.exact.length === 0;
      for (const spell of spells.matches.slice(0, unknown ? MAX_ROWS - 1 : MAX_ROWS)) {
        rows.push({ kind: "spell", spell, label: `${spell.name} (${spell.source})` });
      }
      if (unknown) rows.push({ kind: "unknown", name: spellQuery, label: `${spellQuery} (not in the spell index)` });
    }
  } else if (searching?.type === "item") {
    if (!itemQuery) rows.push({ kind: "status", label: "Type an item name" });
    else if (items.results.isError) rows.push({ kind: "status", label: "The item search failed." });
    else if (items.pending) rows.push({ kind: "status", label: "Searching…" });
    else if (items.items.length === 0) rows.push({ kind: "status", label: "No items match." });
    else {
      for (const item of items.items) {
        rows.push({
          kind: "item",
          item,
          label: `${item.name} (${item.source})`,
          // A specific names its base printing, so two printings never look alike.
          meta: item.family && item.base ? formatItemLink(item.base) : undefined,
        });
      }
    }
  }
  // An unclosed run keeps the menu open even with no rows, so its keys never fall through to the field.
  const open = run !== null;
  const choosable = rows.flatMap((row, index) => (row.kind === "status" ? [] : [index]));

  // The highlight starts on the first row each time the rows change, and stays put while they do not.
  const rowsKey = open ? rows.map(row => row.label).join("\n") : "";
  const [highlight, setHighlight] = useState(0);
  const [seenRows, setSeenRows] = useState(rowsKey);
  if (rowsKey !== seenRows) {
    setSeenRows(rowsKey);
    setHighlight(0);
  }
  const active = choosable.length > 0 ? choosable[Math.min(highlight, choosable.length - 1)] : -1;

  // After the menu edits the text, the caret goes where the edit says once React has shown it.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    const area = areaRef.current;
    if (at === null || !area) return;
    pendingCaret.current = null;
    area.setSelectionRange(at, at);
    setCaret(at);
  }, [text, areaRef]);

  const apply = (edit: TextEdit) => {
    pendingCaret.current = edit.caret;
    setDismissed(null);
    onEdit(edit.text);
  };

  const choose = (index: number) => {
    const row = rows[index];
    if (!run || !row) return;
    if (row.kind === "type") apply(lockReferenceType(text, run, row.type));
    else if (row.kind === "spell") apply(replaceReferenceRun(text, run, referenceTag("spell", row.spell.name, row.spell.source)));
    else if (row.kind === "unknown") apply(replaceReferenceRun(text, run, referenceTag("spell", row.name)));
    else if (row.kind === "item") apply(replaceReferenceRun(text, run, referenceTag("item", row.item.name, row.item.source)));
  };

  /** Reads the caret from the textarea; a selected range is no caret. */
  const readCaret = (area: HTMLTextAreaElement) => setCaret(area.selectionStart === area.selectionEnd ? area.selectionStart : null);

  /** The keys the menu takes while it is open; true when it took this one. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
    const take = () => {
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (choosable.length === 0) return take();
        const at = Math.max(0, choosable.indexOf(active));
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((at + step + choosable.length) % choosable.length);
        return take();
      }
      case "Enter":
      case "Tab":
        // Shift+Tab is the Tab action too: the menu must not let focus leave while it is open.
        if (event.shiftKey && event.key === "Enter") return false;
        if (active !== -1) choose(active);
        return take();
      case " ":
        // With only `{` or `{@` typed there is nothing to type the type with: Space chooses it.
        // After `{s`, the space is typed and the text itself locks the type.
        if (run?.stage === "type" && !run.word && rows[active]?.kind === "type") {
          choose(active);
          return take();
        }
        return false;
      case "Escape":
        if (run) setDismissed(run.start);
        return take();
      default:
        return false;
    }
  };

  /** Props for the textarea, merged by the field with its own handlers. */
  const areaProps = {
    "aria-autocomplete": "list",
    "aria-haspopup": "listbox",
    "aria-controls": listId,
    "aria-activedescendant": open && active !== -1 ? `${listId}-${active}` : undefined,
  } as const;
  const highlighted = active === -1 ? rows[0] : rows[active];
  const announcement = open
    ? `Reference menu open. ${highlighted?.label ?? "No matches"}`
    : "";

  const track = {
    onFocus: (area: HTMLTextAreaElement) => {
      setFocused(true);
      readCaret(area);
    },
    onBlur: () => {
      setFocused(false);
      setDismissed(null);
    },
    /** A change, a key release, a click or a selection: the caret may have moved. */
    onCaret: (area: HTMLTextAreaElement) => readCaret(area),
    onChange: (area: HTMLTextAreaElement) => {
      setDismissed(null);
      readCaret(area);
    },
  };

  // Always mounted so aria-controls has a stable target; hidden (out of the accessibility tree) while closed.
  const menu = (
    <ul id={listId} role="listbox" aria-label="References" className={styles.referenceMenu} hidden={!open}>
      {open && rows.map((row, index) => (
        // The keys are the textarea's (aria-activedescendant), as in ComboboxInput.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <li
          key={`${index}:${row.label}`}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          aria-disabled={row.kind === "status" || undefined}
          className={styles.referenceOption}
          // A press must not blur the textarea: blur commits and closes the menu.
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (row.kind !== "status") choose(index);
          }}
        >
          <span className={styles.referenceLabel}>{row.label}</span>
          {row.kind === "item" && row.meta && <span className={styles.referenceMeta}>{row.meta}</span>}
        </li>
      ))}
    </ul>
  );

  return { open, areaProps, announcement, onKeyDown, track, menu };
}
