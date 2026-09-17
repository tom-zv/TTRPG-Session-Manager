import React, { useEffect, useId, useRef, useState, type RefObject } from "react";
import { MdMoreVert } from "react-icons/md";
import styles from "./ActionMenu.module.css";

export type ActionMenuItem = {
  label: string;
  icon?: React.ReactNode;
  /** Runs the action; an item with `items` opens them instead. */
  onSelect?: () => void;
  /** Listed but not available, for example Move up on the first entry. */
  disabled?: boolean;
  /** A submenu: choosing the item shows these in place of the menu, after a Back item. */
  items?: readonly ActionMenuItem[];
};

type ActionMenuProps = {
  /** Accessible name of the trigger, for example "Actions for Mara". */
  label: string;
  items: readonly ActionMenuItem[];
  /** Settles any open editor on activation. False keeps the menu closed. */
  beforeOpen?: () => boolean;
  /** The trigger's icon; "⋮" by default. */
  icon?: React.ReactNode;
  /** The trigger button, for a caller that has to focus it again after an action. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Replaces the trigger's round icon-button look. */
  triggerClassName?: string;
  /** The menu's edge that lines up with the trigger's; "end" (right) by default. */
  align?: "start" | "end";
  /** Id of text that describes the trigger, e.g. its keyboard shortcuts. */
  describedBy?: string;
  /** Keys on the closed trigger, before it opens the menu; e.g. shortcuts for the items. */
  onTriggerKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onTriggerPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /**
   * Whether a primary press keeps focus where it is until the click (so `beforeOpen` settles an
   * editor on activation). By default it does whenever there is a `beforeOpen`. Keeping focus
   * cancels the press, which also keeps it from starting a drag.
   */
  keepFocusOnPress?: () => boolean;
};

/**
 * A "⋮" button that opens a short list of actions under it, aligned to its right edge.
 * Closes on a choice, Escape (focus returns to the trigger), Tab, or a press outside it.
 * Arrow keys, Home and End move between the items. An item with its own items ("Move to
 * section ▸") shows them in the same place, after a Back item; Escape or Left Arrow goes back.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  label, items, beforeOpen, icon, triggerRef: givenTriggerRef, triggerClassName, align = "end", describedBy, onTriggerKeyDown, onTriggerPointerDown, keepFocusOnPress,
}) => {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  // The submenu shown in place of the items, by its parent's index.
  const [submenu, setSubmenu] = useState<number | null>(null);
  // The item focus returns to when a submenu closes.
  const returnTo = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = givenTriggerRef ?? ownTriggerRef;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const parent = submenu === null ? undefined : items[submenu];
  const shown = parent?.items ?? items;

  useEffect(() => {
    if (!open) return;
    itemRefs.current[returnTo.current ?? 0]?.focus();
    returnTo.current = null;
  }, [open, submenu]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setSubmenu(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setSubmenu(null);
    if (returnFocus) triggerRef.current?.focus();
  };
  const back = () => {
    returnTo.current = submenu;
    setSubmenu(null);
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const buttons = itemRefs.current.filter((button): button is HTMLButtonElement => button !== null);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus();
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (submenu !== null) back();
        else close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(current - 1);
        break;
      case "ArrowRight": {
        // In a submenu the Back item comes first.
        const item = submenu === null ? items[current] : undefined;
        if (!item?.items || item.disabled) break;
        event.preventDefault();
        returnTo.current = 1;
        setSubmenu(current);
        break;
      }
      case "ArrowLeft":
        if (submenu === null) break;
        event.preventDefault();
        back();
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(buttons.length - 1);
        break;
    }
  };

  const choose = (item: ActionMenuItem, index: number) => {
    if (item.disabled) return;
    if (item.items && submenu === null) {
      // Focus the first choice, after Back.
      returnTo.current = 1;
      setSubmenu(index);
      return;
    }
    close(true);
    item.onSelect?.();
  };

  // In a submenu the refs start after the Back item.
  const offset = parent ? 1 : 0;

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? styles.trigger}
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onPointerDown={onTriggerPointerDown}
        onKeyDown={event => {
          if (!open) onTriggerKeyDown?.(event);
        }}
        onMouseDown={event => {
          // Moving focus can settle an editor and move the trigger before the click lands.
          // Keep focus through the press so beforeOpen can settle it on click.
          if (!open && event.button === 0 && (keepFocusOnPress ? keepFocusOnPress() : beforeOpen !== undefined)) event.preventDefault();
        }}
        onClick={() => {
          if (!open && beforeOpen?.() === false) return;
          setSubmenu(null);
          setOpen(value => !value);
        }}
      >
        {icon ?? <MdMoreVert aria-hidden="true" />}
      </button>
      {open && (
        // tabIndex -1: focus sits on the items; the menu itself is reachable only by script.
        <div
          id={menuId}
          role="menu"
          aria-label={parent ? parent.label.replace(/\s*▸$/, "") : label}
          tabIndex={-1}
          className={styles.menu}
          data-align={align}
          onKeyDown={handleMenuKeyDown}
        >
          {parent && (
            <button
              ref={element => {
                itemRefs.current[0] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={styles.item}
              onClick={back}
            >
              ‹ Back
            </button>
          )}
          {shown.map((item, index) => (
            <button
              key={item.label}
              ref={element => {
                itemRefs.current[index + offset] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={styles.item}
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.items ? "menu" : undefined}
              onClick={() => choose(item, index)}
            >
              {item.icon && <span className={styles.icon} aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
