import React, { useEffect, useId, useRef, useState } from "react";
import { MdMoreVert } from "react-icons/md";
import styles from "./ActionMenu.module.css";

export type ActionMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

type ActionMenuProps = {
  /** Accessible name of the trigger, for example "Actions for Mara". */
  label: string;
  items: readonly ActionMenuItem[];
};

/**
 * A "⋮" button that opens a short list of actions under it, aligned to its right edge.
 * Closes on a choice, Escape (focus returns to the trigger), Tab, or a press outside it.
 * Arrow keys, Home and End move between the items.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ label, items }) => {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const buttons = itemRefs.current.filter((button): button is HTMLButtonElement => button !== null);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus();
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
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

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
      >
        <MdMoreVert aria-hidden="true" />
      </button>
      {open && (
        // tabIndex -1: focus sits on the items; the menu itself is reachable only by script.
        <div id={menuId} role="menu" aria-label={label} tabIndex={-1} className={styles.menu} onKeyDown={handleMenuKeyDown}>
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={element => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={styles.item}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
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
