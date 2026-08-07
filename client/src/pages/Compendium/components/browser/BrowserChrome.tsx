import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Focus mode: while the reader scrolls a browser's list, its filter tray folds away so the list gets
 * the height. The search box and the Filters toggle stay.
 * - "expanded": everything shown.
 * - "auto": condensed by scrolling down; scrolling back to the top expands again.
 * - "manual": condensed with the Filters toggle; stays until the toggle opens it again.
 */
export type ChromeMode = "expanded" | "auto" | "manual";

export type BrowserChrome = {
  mode: ChromeMode;
  condensed: boolean;
  setMode: React.Dispatch<React.SetStateAction<ChromeMode>>;
};

const BrowserChromeContext = createContext<BrowserChrome | null>(null);

/** Shares a browser's focus mode with its toolbar. */
export const BrowserChromeProvider: React.FC<{ value: BrowserChrome; children: React.ReactNode }> = ({ value, children }) => (
  <BrowserChromeContext.Provider value={value}>{children}</BrowserChromeContext.Provider>
);

/** A focus-mode state for a browser to own and provide. */
export function useChromeState(): BrowserChrome {
  const [mode, setMode] = useState<ChromeMode>("expanded");
  return { mode, condensed: mode !== "expanded", setMode };
}

/** The provided focus mode, or a local one for a toolbar rendered on its own. */
export function useBrowserChrome(): BrowserChrome {
  const provided = useContext(BrowserChromeContext);
  const local = useChromeState();
  return provided ?? local;
}

/** Scroll this far down before the chrome condenses. */
const CONDENSE_AFTER_PX = 48;
/** Expand again only this close to the top. */
const EXPAND_WITHIN_PX = 4;
/**
 * Condense only when the content would still overflow afterwards. Otherwise the taller pane
 * leaves nothing to scroll, the scroll position snaps to 0 and the chrome expands again, in a loop.
 */
const MIN_OVERFLOW_PX = 320;

/**
 * Only a scroll this soon after the reader's own input condenses. Scrolls nobody asked for (a link
 * bringing its row into view, a window resize) leave the chrome as it is.
 */
const INPUT_WINDOW_MS = 1000;
const INPUT_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

/**
 * Watches every scrollable element inside `root` (the list). Scrolling one down
 * condenses the chrome; scrolling it back to the top expands it, unless the reader collapsed it.
 */
export function useCondenseOnScroll(root: HTMLElement | null, setMode: BrowserChrome["setMode"]) {
  useEffect(() => {
    if (!root) return;
    const lastTop = new WeakMap<EventTarget, number>();
    let lastInputAt = Number.NEGATIVE_INFINITY;
    const onInput = () => {
      lastInputAt = performance.now();
    };

    const onScroll = (event: Event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement)) return;
      const top = element.scrollTop;
      const previous = lastTop.get(element) ?? 0;
      lastTop.set(element, top);
      const byReader = performance.now() - lastInputAt < INPUT_WINDOW_MS;

      if (byReader && top > previous && top > CONDENSE_AFTER_PX && element.scrollHeight - element.clientHeight > MIN_OVERFLOW_PX) {
        setMode(mode => (mode === "expanded" ? "auto" : mode));
      } else if (top < previous && top <= EXPAND_WITHIN_PX) {
        setMode(mode => (mode === "auto" ? "expanded" : mode));
      }
    };

    // Scroll events do not bubble; listen in the capture phase to see every pane's.
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    for (const type of INPUT_EVENTS) root.addEventListener(type, onInput, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll, { capture: true });
      for (const type of INPUT_EVENTS) root.removeEventListener(type, onInput, { capture: true });
    };
  }, [root, setMode]);
}
