import React, { useId } from "react";
import { FiSliders } from "react-icons/fi";
import { useBrowserChrome } from "./BrowserChrome.js";
import styles from "./Browser.module.css";

type BrowserToolbarProps = {
  /** The search landmark's name, e.g. "Filter spells". */
  label: string;
  search: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    maxLength?: number;
    /** The search box's accessible name, e.g. "Search spells by name". */
    label: string;
  };
  searchInputRef?: React.Ref<HTMLInputElement>;
  /** A sort select beside the search box. */
  sort?: React.ReactNode;
  /** Filters inside the tray, below the search row; also enables the Filters toggle. */
  children?: React.ReactNode;
  /** Tray filters in effect, shown on the Filters toggle. The search box is not counted. */
  activeCount?: number;
  /** E.g. "12 of 300 spells". */
  resultLabel: string;
  /** Shown while any filter (search included) is in effect. */
  onClear?: () => void;
  /** Extra controls at the end of the result bar, e.g. "New spell". */
  actions?: React.ReactNode;
};

/**
 * Every Compendium browser's toolbar, laid out the same way so switching sections does not move
 * the search box: search and sort first, then a tray of filters and the result bar. The tray
 * folds away in focus mode (see BrowserChrome) and with the Filters toggle.
 */
export const BrowserToolbar: React.FC<BrowserToolbarProps> = ({
  label,
  search,
  searchInputRef,
  sort,
  children,
  activeCount = 0,
  resultLabel,
  onClear,
  actions,
}) => {
  const { condensed, setMode } = useBrowserChrome();
  const trayId = useId();

  return (
    <div className={styles.filters} role="search" aria-label={label}>
      <div className={styles.filterRow}>
        <input
          ref={searchInputRef}
          type="search"
          className={styles.searchInput}
          placeholder={search.placeholder}
          aria-label={search.label}
          value={search.value}
          maxLength={search.maxLength}
          onChange={event => search.onChange(event.target.value)}
        />
        {sort}
        {children && (
          <button
            type="button"
            className={`${styles.trayToggle} ${condensed ? "" : styles.trayToggleOpen}`}
            aria-expanded={!condensed}
            aria-controls={trayId}
            onClick={() => setMode(condensed ? "expanded" : "manual")}
          >
            <FiSliders aria-hidden="true" />
            Filters
            {activeCount > 0 && (
              <span className={styles.trayCount}>
                {activeCount}
                <span className={styles.visuallyHidden}> active</span>
              </span>
            )}
          </button>
        )}
      </div>

      {/* Folded away (and out of the Tab order) in focus mode. */}
      <div id={trayId} className={styles.tray} inert={condensed}>
        <div className={styles.trayInner}>
          {children}
          <div className={styles.resultBar}>
            <span aria-live="polite">{resultLabel}</span>
            {onClear && (
              <button type="button" className={styles.linkButton} onClick={onClear}>
                Clear filters
              </button>
            )}
            {actions && <span className={styles.resultActions}>{actions}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
