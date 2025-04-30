// Dialog.tsx
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./Dialog.css";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** if true, use the side-panel cutout style; otherwise full-screen overlay */
  sidePanel?: boolean;
  contentRef?: React.RefObject<HTMLDivElement>;
  /** additional CSS class to apply to the dialog container */
  className?: string;
}

const DRAG_EVENTS = ["dragenter", "dragover", "drop"] as const;

const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  sidePanel = false,
  contentRef,
  className = '',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<DOMRect | null>(null);

  // measure side-panel cutout
  const measureCutout = useCallback(() => {
    if (!sidePanel) return;
    const el = document.querySelector(".item-panel-container");
    if (el) setPanelRect(el.getBoundingClientRect());
  }, [sidePanel]);

  useEffect(() => {
    if (!isOpen || !sidePanel) return;
    measureCutout();
    const ro = new ResizeObserver(measureCutout);
    const panelEl = document.querySelector(".item-panel-container");
    if (panelEl) ro.observe(panelEl);
    window.addEventListener("resize", measureCutout);
    return () => {
      window.removeEventListener("resize", measureCutout);
      if (panelEl) ro.unobserve(panelEl);
      ro.disconnect();
    };
  }, [isOpen, sidePanel, measureCutout]);

  // close on outside click
  const handleOutside = useCallback(
    (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (dialogRef.current?.contains(tgt)) return;
      if (
        sidePanel &&
        panelRect &&
        e.clientX >= panelRect.x &&
        e.clientX <= panelRect.x + panelRect.width &&
        e.clientY >= panelRect.y &&
        e.clientY <= panelRect.y + panelRect.height
      ) {
        return;
      }
      onClose();
    },
    [onClose, sidePanel, panelRect]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [isOpen, handleOutside]);

  // lock scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // block all drag/drop outside, allow inside
  useEffect(() => {
    if (!isOpen) return;
    const blocker = (e: Event) => {
      const d = e as DragEvent;
      if (dialogRef.current?.contains(d.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      if (d.dataTransfer) d.dataTransfer.dropEffect = "none";
    };
    DRAG_EVENTS.forEach((n) => document.addEventListener(n, blocker, true));

    const stopper = (e: DragEvent) => e.stopPropagation();
    const cnt = dialogRef.current;
    if (cnt) DRAG_EVENTS.forEach((n) => cnt.addEventListener(n, stopper));

    return () => {
      DRAG_EVENTS.forEach((n) =>
        document.removeEventListener(n, blocker, true)
      );
      if (cnt) DRAG_EVENTS.forEach((n) => cnt.removeEventListener(n, stopper));
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // build mask CSS vars
  const cutoutStyle = useMemo<React.CSSProperties>(() => {
    if (!sidePanel || !panelRect) return {};
    return {
      "--cutout-left": `${panelRect.x}px`,
      "--cutout-top": `${panelRect.y}px`,
      "--cutout-width": `${panelRect.width}px`,
      "--cutout-height": `${panelRect.height}px`,
    } as React.CSSProperties;
  }, [sidePanel, panelRect]);

  return (
    <div
      className={`dialog-overlay${sidePanel ? " side-panel" : ""}`}
      style={cutoutStyle}
    >
      <div className={`dialog-container ${className}`.trim()} ref={dialogRef}>
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="dialog-content" ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Dialog;
