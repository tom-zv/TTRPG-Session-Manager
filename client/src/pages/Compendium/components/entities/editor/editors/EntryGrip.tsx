import React, { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useDragSource } from "src/hooks/useDragSource.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { ActionMenu, type ActionMenuItem } from "../../../ActionMenu/ActionMenu.js";
import { useLiveTarget } from "../../../sheetEditor/live/LiveField.js";
import { useActiveEdit } from "../EntityEditContext.js";
import styles from "./EntryCards.module.css";

/** An entry's grip: its menu items, and the moves and deletion its shortcuts run. */
export type EntryActions = {
  items: ActionMenuItem[];
  /** Absent where the entry cannot move that way (first, last, or not in the draft yet). */
  moveUp?: () => void;
  moveDown?: () => void;
  remove: () => void;
};

/**
 * A press on a grip keeps focus where it is when settling it could move the grip before the click:
 * an open editor, or a field focused in another entry. Such a press opens the menu, not a drag.
 */
const holdsFocusElsewhere = (row: HTMLElement | null, activeId: string | null): boolean => {
  if (activeId !== null) return true;
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused.matches("input, textarea, select") && !row?.contains(focused);
};

type EntryDragOptions = {
  /** Entries of one drag type only drop on each other (text entries, spellcasting blocks). */
  type: string;
  /** The entry's key (`entryKey`), which follows it through moves. */
  rowKey: number;
  name: string;
  /** Another entry of the same type, by its key, was dropped on this one. */
  onDropped: (sourceKey: number) => void;
};

/**
 * Dragging an entry by its grip. A press on the grip makes the row draggable for that press, so
 * the whole row is what moves (a button is not a drag source in every browser).
 */
export const useEntryDrag = ({ type, rowKey, name, onDropped }: EntryDragOptions) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const { dropAreaProps } = useDropTarget<{ index: number }>({
    acceptedTypes: [type],
    onItemsDropped: async items => {
      const source = items[0]?.index;
      if (source !== undefined && source !== rowKey) onDropped(source);
    },
  });
  const { handleDragStart, handleDragEnd } = useDragSource<{ index: number }>({
    contentType: type,
    mode: "reorder",
    getItemId: item => item.index,
    getItemName: () => name,
  });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const disarm = () => setArmed(false);
    window.addEventListener("pointerup", disarm);
    window.addEventListener("pointercancel", disarm);
    return () => {
      window.removeEventListener("pointerup", disarm);
      window.removeEventListener("pointercancel", disarm);
    };
  }, [armed]);

  const rowProps = {
    ...dropAreaProps,
    ref: rowRef,
    className: dropAreaProps.className,
    draggable: armed || undefined,
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
      if (event.target === rowRef.current) handleDragStart(event, [{ index: rowKey }]);
    },
    onDragEnd: (event: React.DragEvent<HTMLDivElement>) => {
      setArmed(false);
      handleDragEnd(event);
    },
  };
  return { rowRef, rowProps, arm: () => setArmed(true) };
};

type EntryGripProps = {
  /** The entry's id (`actions.3`, `spellcasting.0`): `<id>.menu` focuses the grip after a move. */
  id: string;
  label: string;
  actions: EntryActions;
  rowRef: RefObject<HTMLDivElement | null>;
  /** Arms the row's drag for this press; absent where the entry cannot be dragged (not in the draft yet). */
  arm?: () => void;
};

/**
 * An entry's ⠿ grip, last in its Tab order and drawn in the margin left of the entry, never over
 * its text: dragging it moves the entry, a click opens its options, and while it has focus
 * Alt+Up / Alt+Down move the entry and Delete removes it. On touch it takes a column of its own.
 */
export const EntryGrip: React.FC<EntryGripProps> = ({ id, label, actions, rowRef, arm }) => {
  const edit = useActiveEdit();
  const menuRef = useRef<HTMLButtonElement>(null);
  useLiveTarget([`${id}.menu`], menuRef);
  const helpId = useId();
  return (
    // Focusing it settles any open editor.
    <span className={styles.entryTools} onFocus={() => void edit.claim()}>
      <ActionMenu
        label={label}
        items={actions.items}
        beforeOpen={() => edit.claim()}
        icon={<span aria-hidden="true">⠿</span>}
        triggerRef={menuRef}
        triggerClassName={styles.grip}
        align="start"
        describedBy={helpId}
        keepFocusOnPress={() => holdsFocusElsewhere(rowRef.current, edit.activeId)}
        onTriggerPointerDown={event => {
          if (event.button === 0 && arm && !holdsFocusElsewhere(rowRef.current, edit.activeId)) arm();
        }}
        onTriggerKeyDown={event => {
          const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey;
          const run = (action: (() => void) | undefined) => {
            event.preventDefault();
            action?.();
          };
          if (plain && event.altKey && event.key === "ArrowUp") run(actions.moveUp);
          else if (plain && event.altKey && event.key === "ArrowDown") run(actions.moveDown);
          else if (plain && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) run(actions.remove);
        }}
      />
      <span id={helpId} hidden>
        {arm ? "Drag to move it. Alt+Up or Alt+Down moves it, Delete removes it." : "Delete removes it."}
      </span>
    </span>
  );
};
