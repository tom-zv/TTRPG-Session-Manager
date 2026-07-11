import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./RowTray.module.css";

/** Room kept clear between the row's right edge and the tray, for the selection marker. */
const SIDE_GAP = 26;
const TRIGGER_GAP = 8;
const VIEWPORT_MARGIN = 8;
const ARROW_INSET = 14;

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

type Placement = "right" | "below" | "above";
type Position = { placement: Placement; top: number; left: number; arrow: number };

type RowTrayProps = {
  id: string;
  /** Accessible name of the tray, for example "Actions for Goblin 2". */
  label: string;
  /** The row the tray is attached to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The button that opened the tray. Focus returns to it, and clicks on it are not "outside". */
  triggerRef: RefObject<HTMLElement | null>;
  /** `returnFocus` is true when the user closed it from the keyboard. */
  onClose: (returnFocus: boolean) => void;
  /** Focus the first control on open. Off when the content focuses something itself. */
  focusFirstControl?: boolean;
  /** `wide` for forms that need a row of controls. */
  size?: "default" | "wide";
  children: React.ReactNode;
};

function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * A floating panel attached to an entity row, for actions and short inputs that should not make
 * the row grow.
 *
 * It sits in the free space to the right of the row, top-aligned with it, with a pointer at the
 * button that opened it. When there is no room on the right (narrow layouts) it drops below that
 * button, or above it near the bottom of the screen. It is rendered at the end of `<body>` so the
 * row list's scroll container cannot clip it, and follows the row while the list scrolls; it
 * closes once the row scrolls out of view.
 *
 * Closing: Escape, a click outside, or tabbing past either end (focus then returns to the trigger,
 * so the keyboard order continues in the row).
 *
 * React bubbles events from a portal through the component tree, so the row's handlers see clicks
 * made in the tray. Rows ignore events that did not start inside their own DOM (`rowEvents.ts`).
 */
export const RowTray: React.FC<RowTrayProps> = ({
  id,
  label,
  anchorRef,
  triggerRef,
  onClose,
  focusFirstControl = true,
  size = "default",
  children,
}) => {
  const trayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const trigger = triggerRef.current;
    const tray = trayRef.current;
    if (!anchor || !trigger || !tray) return;

    const row = anchor.getBoundingClientRect();
    const scrollParent = scrollParentOf(anchor);
    if (scrollParent) {
      const visible = scrollParent.getBoundingClientRect();
      if (row.bottom < visible.top || row.top > visible.bottom) {
        onCloseRef.current(false);
        return;
      }
    }

    const button = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = tray;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    if (row.right + SIDE_GAP + width <= viewportWidth - VIEWPORT_MARGIN) {
      const top = clamp(row.top, VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
      const buttonMiddle = button.top + button.height / 2;
      setPosition({
        placement: "right",
        top,
        left: row.right + SIDE_GAP,
        arrow: clamp(buttonMiddle - top, ARROW_INSET, height - ARROW_INSET),
      });
      return;
    }

    const fitsBelow = button.bottom + TRIGGER_GAP + height <= viewportHeight - VIEWPORT_MARGIN;
    const fitsAbove = button.top - TRIGGER_GAP - height >= VIEWPORT_MARGIN;
    const placement: Placement = fitsBelow || !fitsAbove ? "below" : "above";
    const top = placement === "below"
      ? Math.min(button.bottom + TRIGGER_GAP, viewportHeight - height - VIEWPORT_MARGIN)
      : button.top - TRIGGER_GAP - height;
    const left = clamp(button.right - width, VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    setPosition({
      placement,
      top: Math.max(VIEWPORT_MARGIN, top),
      left,
      arrow: clamp(button.left + button.width / 2 - left, ARROW_INSET, width - ARROW_INSET),
    });
  }, [anchorRef, triggerRef]);

  // Measure before the first paint, so the tray never flashes in the wrong place. The tray is not
  // hidden while unmeasured: content that focuses one of its controls on mount must be able to.
  useLayoutEffect(() => {
    place();
  }, [place]);

  // Follow the row: list scrolling, window resizing, and either element changing size.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (trayRef.current) observer.observe(trayRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [place, anchorRef]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (trayRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onCloseRef.current(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [triggerRef]);

  const isPlaced = position !== null;
  useEffect(() => {
    if (!focusFirstControl || !isPlaced) return;
    trayRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [focusFirstControl, isPlaced]);

  // Escape and tabbing past either end close the tray and put focus back on the trigger.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;
    const closeAndReturnFocus = () => {
      onCloseRef.current(true);
      triggerRef.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndReturnFocus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...tray.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const leavingStart = event.shiftKey && document.activeElement === focusable[0];
      const leavingEnd = !event.shiftKey && document.activeElement === focusable[focusable.length - 1];
      if (focusable.length === 0 || leavingStart || leavingEnd) {
        event.preventDefault();
        closeAndReturnFocus();
      }
    };
    tray.addEventListener("keydown", handleKeyDown);
    return () => tray.removeEventListener("keydown", handleKeyDown);
  }, [triggerRef]);

  return createPortal(
    <div
      ref={trayRef}
      id={id}
      role="dialog"
      aria-label={label}
      className={styles.tray}
      data-placement={position?.placement ?? "right"}
      data-size={size}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        ["--tray-arrow" as string]: `${position?.arrow ?? ARROW_INSET}px`,
      }}
    >
      <span className={styles.arrow} aria-hidden="true" />
      {children}
    </div>,
    document.body
  );
};

type RowTraySectionProps = {
  title: React.ReactNode;
  children: React.ReactNode;
};

/** A titled group inside a tray. */
export const RowTraySection: React.FC<RowTraySectionProps> = ({ title, children }) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    {children}
  </section>
);

type RowTrayItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  /** Short note at the end of the item, for example "Soon". */
  badge?: React.ReactNode;
  tone?: "default" | "danger";
};

/** A full-width action in a tray. */
export const RowTrayItem: React.FC<RowTrayItemProps> = ({ icon, badge, tone = "default", children, className, ...props }) => (
  <button
    type="button"
    {...props}
    className={`${styles.item}${tone === "danger" ? ` ${styles.itemDanger}` : ""}${className ? ` ${className}` : ""}`}
  >
    <span className={styles.itemIcon} aria-hidden="true">{icon}</span>
    <span className={styles.itemLabel}>{children}</span>
    {badge && <span className={styles.itemBadge}>{badge}</span>}
  </button>
);
