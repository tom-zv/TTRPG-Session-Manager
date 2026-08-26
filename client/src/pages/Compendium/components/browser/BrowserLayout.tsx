import React, { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import Dialog from "src/components/Dialog/Dialog.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import { BrowserChromeProvider, useChromeState, useCondenseOnScroll } from "./BrowserChrome.js";
import type { SelectVia } from "./BrowserList.js";
import styles from "./Browser.module.css";

/** At this width and below, details open in a dialog over the list instead of beside it. */
export const NARROW_BROWSER_QUERY = "(max-width: 800px)";

/**
 * Where a browser's details render beside the list: the page's reader pane for that section. Null
 * on narrow screens (details open in a dialog) and until the pane has mounted.
 */
export const BrowserDetailSlot = createContext<HTMLElement | null>(null);

export type BrowserDetail = ReturnType<typeof useBrowserDetail>;

type BrowserDetailOptions = {
  /**
   * The current selection. When given, a selection that did not come from the list (a direct link,
   * Back/Forward, a save) opens the details dialog on narrow screens. A string names a selection
   * that is not a list row, such as a new entity's draft.
   */
  selectedId?: number | string | null;
  /**
   * While true, narrow screens show the details dialog, however the details got there (Forward to
   * the selected row's editor, a resize from the desktop layout). For work in progress, such as an
   * editor; closing the dialog has to end that work first.
   */
  keepOpen?: boolean;
};

/** Where a browser shows its details: a pane beside the list, or a dialog on narrow screens. */
export function useBrowserDetail({ selectedId, keepOpen = false }: BrowserDetailOptions = {}) {
  const isNarrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const [dialogOpen, setDialogOpen] = useState(false);
  // A callback ref kept in state, so the layout can attach it during render.
  const [detailPane, setDetailPane] = useState<HTMLDivElement | null>(null);
  // The last row chosen in the list, and the last selection seen; both compared during render.
  const [listSelectedId, setListSelectedId] = useState<number | null>(null);
  const [seenSelectedId, setSeenSelectedId] = useState<number | string | null>(null);

  if (selectedId !== undefined && selectedId !== seenSelectedId) {
    setSeenSelectedId(selectedId);
    if (isNarrow && selectedId !== null && selectedId !== listSelectedId) setDialogOpen(true);
  }
  if (keepOpen && isNarrow && !dialogOpen) setDialogOpen(true);

  return {
    isNarrow,
    dialogOpen,
    setDetailPane,
    /** After a row is chosen: on narrow screens a tap opens its details; arrow keys only move. */
    onRowSelected: (id: number, via: SelectVia) => {
      setListSelectedId(id);
      if (isNarrow && via === "pointer") setDialogOpen(true);
    },
    /** Enter on the list: open the dialog, or move focus to the detail pane. */
    open: () => {
      if (isNarrow) setDialogOpen(true);
      else detailPane?.focus();
    },
    close: () => setDialogOpen(false),
  };
}

type BrowserLayoutProps = {
  detailState: BrowserDetail;
  /** Filters and toolbar above the list. */
  toolbar?: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  /** The detail pane's accessible name, e.g. "Spell details". */
  detailLabel: string;
  /** The narrow-screen dialog's title, usually the selected item's name. */
  dialogTitle: string;
  /** False while nothing (or nothing known) is selected; keeps the narrow dialog closed. */
  hasSelection: boolean;
};

export const BrowserLayout: React.FC<BrowserLayoutProps> = ({
  detailState: { isNarrow, dialogOpen, close, setDetailPane },
  toolbar,
  list,
  detail,
  detailLabel,
  dialogTitle,
  hasSelection,
}) => {
  const detailSlot = useContext(BrowserDetailSlot);
  const [listPane, setListPane] = useState<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  // Focus mode: scrolling the list folds the filter tray. The reader pane is outside `root`, so
  // reading a long sheet leaves the filters alone.
  const chrome = useChromeState();
  useCondenseOnScroll(root, chrome.setMode);

  // Dialog returns focus to whatever was focused when it opened, which is the list after a tap or
  // Enter. A dialog opened by a link had nothing focused; land on the list then too. Runs before
  // Dialog's own restore, which then has nothing to move. The filters are untouched either way.
  const closeDialog = () => {
    close();
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        listPane?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
      }
    }, 0);
  };

  return (
    <BrowserChromeProvider value={chrome}>
      <div ref={setRoot} className={styles.browser} data-condensed={chrome.condensed || undefined}>
        {toolbar}
        <div ref={setListPane} className={styles.listPane}>{list}</div>
        {isNarrow ? (
          <Dialog isOpen={dialogOpen && hasSelection} onClose={closeDialog} title={dialogTitle}>
            {detail}
          </Dialog>
        ) : (
          detailSlot && createPortal(
            <div ref={setDetailPane} className={styles.detailPane} tabIndex={-1} aria-label={detailLabel}>
              {detail}
            </div>,
            detailSlot
          )
        )}
      </div>
    </BrowserChromeProvider>
  );
};
