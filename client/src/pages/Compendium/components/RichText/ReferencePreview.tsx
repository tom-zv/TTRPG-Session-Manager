import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { Popover } from "src/components/Popover/Popover.js";
import styles from "./ReferencePreview.module.css";

const OPEN_DELAY = 250;
const CLOSE_DELAY = 150;

// Only one preview is open at a time, spell or item: opening one closes the previous.
let closeActivePreview: (() => void) | null = null;

type Mode = "closed" | "peek" | "pinned";

const ClosePreview = createContext<() => void>(() => {});

/** Inside a preview: closes it, e.g. before following a link out of it. */
export const useClosePreview = () => useContext(ClosePreview);

type ReferencePreviewProps = {
  /** The popover's accessible name, e.g. the spell's or item's name. */
  label: string;
  /** Accessible name of the pinned preview's close button. */
  closeLabel: string;
  /** Starts loading the details the preview shows. */
  prefetch: () => void;
  /** The mention's text. */
  children: React.ReactNode;
  /** The preview's content, rendered only while it is open; useClosePreview closes it. */
  preview: React.ReactNode;
};

/**
 * A mention with a preview. Hover (after a short delay) or keyboard focus shows it; click,
 * Enter or a tap pins it until Escape, a click outside or its close button.
 */
export const ReferencePreview: React.FC<ReferencePreviewProps> = ({ label, closeLabel, prefetch, children, preview }) => {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const focusOnPin = useRef(false);
  const [mode, setMode] = useState<Mode>("closed");

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };

  const close = useCallback(() => {
    clearTimers();
    setMode("closed");
  }, []);

  useEffect(() => {
    if (mode === "closed") {
      if (closeActivePreview === close) closeActivePreview = null;
      return;
    }
    if (closeActivePreview && closeActivePreview !== close) closeActivePreview();
    closeActivePreview = close;
  }, [mode, close]);

  useEffect(() => () => {
    clearTimers();
    if (closeActivePreview === close) closeActivePreview = null;
  }, [close]);

  useEffect(() => {
    if (mode === "pinned" && focusOnPin.current) {
      focusOnPin.current = false;
      closeButtonRef.current?.focus();
    }
  }, [mode]);

  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    if (mode !== "peek") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY);
  };

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const pinned = mode === "pinned";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={mode !== "closed"}
        aria-controls={mode !== "closed" ? popoverId : undefined}
        aria-haspopup="dialog"
        onPointerEnter={event => {
          if (event.pointerType !== "mouse") return;
          cancelClose();
          if (mode === "closed") openTimer.current = window.setTimeout(() => {
            prefetch();
            setMode("peek");
          }, OPEN_DELAY);
        }}
        onPointerLeave={event => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
        onFocus={event => {
          prefetch();
          if (mode === "closed" && event.currentTarget.matches(":focus-visible")) setMode("peek");
        }}
        onBlur={event => {
          const next = event.relatedTarget;
          const intoPopover = next instanceof Node && document.getElementById(popoverId)?.contains(next);
          if (mode === "peek" && !intoPopover) close();
        }}
        onClick={event => {
          clearTimers();
          if (pinned) {
            close();
            return;
          }
          focusOnPin.current = event.detail === 0; // keyboard activation
          setMode("pinned");
        }}
      >
        {children}
      </button>
      {mode !== "closed" && (
        <Popover
          id={popoverId}
          label={label}
          anchorRef={triggerRef}
          onClose={close}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          <div className={`${styles.preview} ${pinned ? styles.pinned : ""}`}>
            {pinned && (
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeButton}
                aria-label={closeLabel}
                onClick={() => {
                  close();
                  triggerRef.current?.focus();
                }}
              >
                <FiX aria-hidden="true" />
              </button>
            )}
            <ClosePreview.Provider value={close}>{preview}</ClosePreview.Provider>
          </div>
        </Popover>
      )}
    </>
  );
};
