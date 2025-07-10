// Dialog.tsx
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import "./Dialog.css";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** if true, use the side-panel cutout style; otherwise full-screen overlay */
  sidePanel?: boolean;
  contentRef?: React.RefObject<HTMLDivElement>;
  className?: string;
  noOverlay?: boolean;
}

const DRAG_EVENTS = ["dragenter", "dragover", "drop", "dragstart"] as const;

const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  contentRef,
  className = "",
  noOverlay = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // close on outside click
  const handleOutside = useCallback(
    (e: MouseEvent) => {
      if ( noOverlay ) return
      const tgt = e.target as Node;
      if (dialogRef.current?.contains(tgt)) return;
      onClose();
    },
    [onClose, noOverlay]
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
    if (!isOpen || noOverlay) return;

    const blocker = (e: Event) => {
      const d = e as DragEvent;
      // Allow events inside dialog
      if (dialogRef.current?.contains(d.target as Node)) return;

      // Block all other drag events
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
  }, [isOpen, noOverlay]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    noOverlay ? (
      <div
        className={`dialog-container standalone ${className}`.trim()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <h2>{title}</h2>
          <button
            className="close-button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="dialog-content" ref={contentRef}>
          {children}
        </div>
      </div>
    ) : (
      <div
        className="dialog-overlay"
        draggable={false}
        aria-label="Dialog overlay"
      >
        <div
          className={`dialog-container ${className}`.trim()}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <header className="dialog-header">
            <h2>{title}</h2>
            <button
              className="close-button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="dialog-content" ref={contentRef}>
            {children}
          </div>
        </div>
      </div>
    ),
    document.body
  );
};

export default Dialog;