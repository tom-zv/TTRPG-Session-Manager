// Dialog.tsx
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useId,
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
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  noOverlay?: boolean;
}

const DRAG_EVENTS = ["dragenter", "dragover", "drop", "dragstart"] as const;

const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  contentRef: externalContentRef,
  initialFocusRef,
  returnFocusRef,
  className = "",
  noOverlay = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // close on outside click
  const handleOutside = useCallback(
    (e: MouseEvent) => {
      if (noOverlay) return;
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, isOpen]);

  // lock scroll
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isOpen ? "hidden" : previousOverflow;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnFocusElement = returnFocusRef?.current ?? null;

    const focusTarget =
      initialFocusRef?.current ??
      getFocusableElements(getDialogContent(dialogRef.current)).find((element) =>
        isFormControl(element)
      ) ??
      getFocusableElements(dialogRef.current)[0] ??
      dialogRef.current;

    window.requestAnimationFrame(() => {
      focusTarget?.focus();
    });

    return () => {
      window.setTimeout(() => {
        (returnFocusElement ?? previousActiveElement)?.focus();
      }, 0);
    };
  }, [initialFocusRef, isOpen, returnFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const portalElement =
      (noOverlay ? dialogRef.current : dialogRef.current?.parentElement) ?? null;
    if (!portalElement) return;

    const hiddenSiblings = Array.from(document.body.children)
      .filter((element) => element !== portalElement)
      .map((element) => {
        const target = element as HTMLElement & { inert?: boolean };
        return {
          element: target,
          ariaHidden: target.getAttribute("aria-hidden"),
          inert: target.inert,
        };
      });

    hiddenSiblings.forEach(({ element }) => {
      element.setAttribute("aria-hidden", "true");
      element.inert = true;
    });

    return () => {
      hiddenSiblings.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden == null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        element.inert = inert;
      });
    };
  }, [isOpen, noOverlay]);

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
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
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
        <div className="dialog-content" ref={externalContentRef}>
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
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className="dialog-header">
            <h2 id={titleId}>{title}</h2>
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
          <div className="dialog-content" ref={externalContentRef}>
            {children}
          </div>
        </div>
      </div>
    ),
    document.body
  );
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] => {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null
  );
};

const getDialogContent = (dialog: HTMLElement | null): HTMLElement | null =>
  dialog?.querySelector<HTMLElement>(".dialog-content") ?? null;

const isFormControl = (element: HTMLElement): boolean =>
  ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);

export default Dialog;
