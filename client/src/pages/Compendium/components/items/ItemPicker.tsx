import React, { useEffect, useId, useRef, useState } from "react";
import { ITEM_LIST_LIMITS, type ItemSummary } from "shared/domain/dnd5e/item.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { useItemPicker } from "../../api/query/useItemQueries.js";
import { formatItemLink } from "./itemFormat.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./ItemPicker.module.css";

/** Wait this long after typing before searching the server, like the Items browser. */
const SEARCH_DELAY_MS = 250;

type ItemPickerProps = {
  viewer: ItemViewer;
  /** Names the picker, e.g. "Choose a catalog item for item 2". */
  label: string;
  onPick: (item: ItemSummary) => void;
  /** Cancel, or Escape anywhere in the picker. */
  onCancel: () => void;
  /** Leave out generated specifics, as a base item must. */
  excludeSpecifics?: boolean;
  /** An item that cannot be chosen (an item cannot be its own base). */
  excludeId?: number;
};

/**
 * Inline catalog search. Only concrete items are offered, so a magic variant resolves to an exact
 * printing ("+1 Longsword", base Longsword (PHB)) before it is chosen. Every match is reachable
 * through "Show more". Inline rather than a dialog: it may already sit in a dialog (the narrow
 * reader, the item form), and Escape inside it closes only the picker.
 */
export const ItemPicker: React.FC<ItemPickerProps> = ({ viewer, label, onPick, onCancel, excludeSpecifics, excludeId }) => {
  const headingId = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text]);
  const results = useItemPicker(viewer, query, excludeSpecifics ? { specifics: false } : {});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  // Escape from any control in the picker (search, a result, Show more, Cancel) closes only the
  // picker. The enclosing dialog listens on the document, so the key must stop here.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const pages = query ? results.data?.pages ?? [] : [];
  const items = pages.flatMap(page => page.items).filter(item => item.id !== excludeId);
  const total = pages[0]?.total ?? 0;
  const shown = pages.reduce((count, page) => count + page.items.length, 0);

  return (
    <div ref={root} className={styles.picker} role="group" aria-labelledby={headingId}>
      <p id={headingId} className={styles.title}>{label}</p>
      <div className={styles.search}>
        <input
          ref={input}
          type="search"
          aria-label="Search the item catalog"
          placeholder="Search items"
          maxLength={ITEM_LIST_LIMITS.query}
          value={text}
          onChange={event => setText(event.target.value)}
          // Enter searches here; it must not submit the enclosing form.
          onKeyDown={event => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
        <button type="button" className={browserStyles.secondaryButton} onClick={onCancel}>Cancel</button>
      </div>
      {results.error && <p className={browserStyles.statusError} role="alert">{results.error.message}</p>}
      {query && results.isSuccess && items.length === 0 && !results.hasNextPage && <p className={styles.status}>No items match.</p>}
      {items.length > 0 && (
        <ul className={styles.results} aria-label="Matching items">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.meta}>
                  {item.source}
                  {/* A specific names its base printing, so two printings never look alike. */}
                  {item.family && item.base && ` · ${formatItemLink(item.base)}`}
                  {item.gm && (item.gm.hidden || item.gm.hiddenByFamily) && " · Hidden from players"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > shown && (
        <div className={styles.more}>
          <span className={styles.status}>Showing {shown} of {total}.</span>
          <button
            type="button"
            className={browserStyles.secondaryButton}
            onClick={() => void results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
          >
            {results.isFetchingNextPage ? "Loading…" : "Show more items"}
          </button>
        </div>
      )}
    </div>
  );
};
