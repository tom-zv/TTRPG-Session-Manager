import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./Popover.module.css";

const GAP = 6;
const VIEWPORT_MARGIN = 8;

type Placement = "below" | "above";
type Position = { placement: Placement; top: number; left: number };

type PopoverProps = {
  id: string;
  /** Accessible name, for example the spell's name. */
  label: string;
  /** The element the popover points at. Clicks on it are not "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  /** `returnFocus` is true when the user closed it from the keyboard (Escape). */
  onClose: (returnFocus: boolean) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  children: React.ReactNode;
};

/**
 * A panel anchored to an inline element (a word in a sentence), for previews such as spell
 * tooltips. Rendered at the end of <body> so scroll containers cannot clip it. Prefers the space
 * below the anchor, flips above when that does not fit, and stays inside the viewport. Follows the
 * anchor while anything scrolls.
 *
 * Closing: Escape (focus returns to the anchor) or a pointer press outside it and the anchor.
 * RowTray solves the same problem for entity rows; this one is not tied to rows.
 */
export const Popover: React.FC<PopoverProps> = ({
  id,
  label,
  anchorRef,
  onClose,
  onPointerEnter,
  onPointerLeave,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    const fitsBelow = rect.bottom + GAP + height <= viewportHeight - VIEWPORT_MARGIN;
    const fitsAbove = rect.top - GAP - height >= VIEWPORT_MARGIN;
    const placement: Placement = fitsBelow || !fitsAbove ? "below" : "above";
    const top = placement === "below"
      ? Math.min(rect.bottom + GAP, viewportHeight - height - VIEWPORT_MARGIN)
      : rect.top - GAP - height;
    const maxLeft = viewportWidth - width - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));

    setPosition({ placement, top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [anchorRef]);

  // Measure before the first paint so the panel never flashes in the wrong place.
  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [place]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current(true);
      anchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      className={styles.popover}
      data-placement={position?.placement ?? "below"}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? undefined : "hidden" }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body
  );
};
