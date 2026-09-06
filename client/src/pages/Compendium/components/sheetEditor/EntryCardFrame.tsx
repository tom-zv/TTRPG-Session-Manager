import React, { useEffect, useId, useRef } from "react";
import { useDragSource } from "src/hooks/useDragSource.js";
import { useActiveSheetEdit, useCommitHandler, useEditorState } from "./SheetEditContext.js";
import styles from "./EntryCardFrame.module.css";

/** The drag payload type of an entry card; only entries of the same section accept it. */
export const ENTRY_DRAG_TYPE = "sheet-entry";

/** What the sections give an open card: where it is, and how to save it there. `Item` is the record type's entry. */
export type EntryCardHost<Item> = {
  /** The editor id: the entry's validator path ("actions.2"), or the id of a new entry. */
  id: string;
  /** Names the card: "Bite, Actions". */
  label: string;
  /** The entry as it was when the card opened; a new entry is blank. */
  item: Item;
  isNew: boolean;
  sectionKey: string;
  /** Entries move only among entries of the same group within a section (for example text entries). */
  group: string;
  /** Position among the entries of its group in the section, and how many there are. */
  position: { index: number; count: number };
  /** Sections the entry may move to. */
  sectionChoices: readonly { key: string; title: string }[];
  /**
   * Saves the card's entry (null drops it), optionally moving it, as one edit. Returns a problem,
   * or the id the saved entry now has (for a dropped entry, the target that takes focus).
   */
  save: (item: Item | null, move?: { to?: number; section?: string }) => { problem?: string; id?: string };
  /** Where focus goes when the entry is dropped, deleted, or a new one is cancelled. */
  returnId: string;
  /**
   * The control ("up" or "down") this card focuses when it mounts, after a move reopened it at its
   * new place. Reading it does not clear it, so a mount effect that runs twice (StrictMode) agrees.
   */
  initialFocus: () => string | null;
  /** Asks the card that opens as `id` to focus `control`; null forgets the request. */
  setInitialFocus: (id: string | null, control?: string) => void;
  /** Lets the open card be dropped on another entry: of its own section and group, it moves there. */
  registerDrop: (drop: EntryDropHandler | null) => void;
  announce: (message: string) => void;
};

/** A drop on an entry: its section, its group, and its position in that group. */
export type EntryDropHandler = (target: { sectionKey: string; group: string; position: number }) => void;

/** A card's current value: the entry (null when abandoned empty) and the section it should be in. */
export type EntryCardRead<Item> = { item: Item | null; section: string } | false;

type EntryCardFrameProps<Item> = {
  host: EntryCardHost<Item>;
  /** Reads and checks the card's fields; false (after showing the problem) when they are invalid. */
  read: () => EntryCardRead<Item>;
  /** The card's own problem, shown with the frame's. */
  error: string | null;
  /** The name of the entry for messages ("Deleted Bite."). */
  name: string;
  children: React.ReactNode;
};

/**
 * The expanding card an entry turns into: its fields, then move up and down, a drag handle and
 * Delete, then Cancel and Done. Enter in a field or Done saves; Escape or Cancel discards.
 * Opening another editor saves it first, and keeps it open when it is invalid.
 */
export const EntryCardFrame = <Item,>({ host, read, error, name, children }: EntryCardFrameProps<Item>): React.ReactElement => {
  const edit = useActiveSheetEdit();
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();
  const [problem, setProblem] = useEditorState<string | null>("card.problem", null);
  const shown = error ?? problem;

  const apply = (): { id?: string } | false => {
    host.setInitialFocus(null);
    const current = read();
    if (!current) return false;
    const result = host.save(current.item, current.section !== host.sectionKey ? { section: current.section } : undefined);
    if (result.problem) {
      setProblem(result.problem);
      return false;
    }
    return { id: result.id };
  };
  useCommitHandler(() => apply() !== false, formRef);

  const cancel = () => {
    host.setInitialFocus(null);
    if (host.isNew) edit.closeTo(host.returnId);
    else edit.close(true);
  };

  const move = (to: number, focusControl: string | null) => {
    const current = read();
    if (!current || !current.item) return;
    const result = host.save(current.item, { to });
    if (result.problem || !result.id) {
      setProblem(result.problem ?? "This entry cannot move there.");
      return;
    }
    host.setInitialFocus(focusControl ? result.id : null, focusControl ?? undefined);
    edit.switchTo(result.id);
  };
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });
  useEffect(() => {
    host.registerDrop(target => {
      if (target.sectionKey === host.sectionKey && target.group === host.group) moveRef.current(target.position, null);
    });
    return () => host.registerDrop(null);
  }, [host]);

  const remove = () => {
    host.setInitialFocus(null);
    let focusId = host.returnId;
    if (!host.isNew) {
      const result = host.save(null);
      if (result.problem) {
        setProblem(result.problem);
        return;
      }
      host.announce(`Deleted ${name || "the entry"}. Undo restores it.`);
      // The last entry of a section takes the section, and its "+ Add", with it.
      focusId = result.id ?? focusId;
    }
    edit.closeTo(focusId);
  };

  // A card opens on a user's action: focus the control a move left it on, or its first field.
  useEffect(() => {
    const control = host.initialFocus();
    const form = formRef.current;
    // A move to the first or last place disables that control; the other one keeps the focus nearby.
    const other = control === "up" ? "down" : "up";
    const wanted = control
      ? form?.querySelector<HTMLElement>(`[data-card-control="${control}"]:not(:disabled)`)
        ?? form?.querySelector<HTMLElement>(`[data-card-control="${other}"]:not(:disabled)`)
      : null;
    (wanted ?? form?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)"))?.focus();
    // Mount only: later renders must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { handleDragStart, handleDragEnd } = useDragSource<{ index: number }>({
    contentType: ENTRY_DRAG_TYPE,
    mode: "reorder",
    getItemId: item => item.index,
    getItemName: () => name,
  });
  const { index, count } = host.position;

  return (
    // Escape from any control in the card discards it, before the key reaches a dialog around the sheet.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      ref={formRef}
      className={styles.card}
      aria-label={`Edit ${host.label}`}
      aria-describedby={shown ? errorId : undefined}
      noValidate
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }}
      onSubmit={event => {
        event.preventDefault();
        const result = apply();
        if (result) edit.closeTo(result.id ?? host.returnId);
      }}
    >
      {children}
      {shown && <p id={errorId} role="alert" className={styles.error}>{shown}</p>}
      <div className={styles.cardTools}>
        {!host.isNew && (
          <>
            <span
              className={styles.dragHandle}
              draggable
              title="Drag onto another entry of this section to move it there"
              aria-hidden="true"
              onDragStart={event => handleDragStart(event, [{ index }])}
              onDragEnd={handleDragEnd}
            >
              ⠿
            </span>
            <button type="button" data-card-control="up" disabled={index === 0} onClick={() => move(index - 1, "up")}>Move up</button>
            <button type="button" data-card-control="down" disabled={index >= count - 1} onClick={() => move(index + 1, "down")}>Move down</button>
          </>
        )}
        <button type="button" className={styles.danger} onClick={remove}>{host.isNew ? "Discard" : "Delete"}</button>
        <span className={styles.spacer} />
        <button type="button" onClick={cancel}>Cancel</button>
        <button type="submit" className={styles.primary}>Done</button>
      </div>
    </form>
  );
};

/** Canonical JSON (sorted keys, undefined left out), to tell an untouched entry from an edited one. */
export const sameValue = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );

const encoder = new TextEncoder();
/** The write contract's description limit, in UTF-8 bytes. */
export const descriptionTooLong = (text: string, maxBytes: number): boolean => encoder.encode(text.trim()).length > maxBytes;
