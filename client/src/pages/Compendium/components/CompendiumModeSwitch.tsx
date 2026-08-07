import React, { useRef } from "react";
import type { IconType } from "react-icons";
import type { CompendiumSection } from "../hooks/useCompendiumUrl.js";
import styles from "./CompendiumModeSwitch.module.css";

export type CompendiumMode = {
  value: CompendiumSection;
  label: string;
  /** A short line under the label, e.g. "Rules and homebrew". Not part of the tab's name. */
  hint: string;
  icon: IconType;
  panelId: string;
};

type CompendiumModeSwitchProps = {
  modes: readonly CompendiumMode[];
  value: CompendiumSection;
  onChange: (value: CompendiumSection) => void;
};

/**
 * The Compendium's main display mode: a compact segmented tablist with a sliding indicator, sized to
 * the top of the finder column. Each mode's hint is its tooltip and accessible description. Follows the ARIA tabs
 * pattern: one tab in the Tab order, arrow keys and Home/End move between tabs and select them.
 */
export const CompendiumModeSwitch: React.FC<CompendiumModeSwitchProps> = ({ modes, value, onChange }) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, modes.findIndex(mode => mode.value === value));

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const last = modes.length - 1;
    const next =
      event.key === "ArrowRight" ? (activeIndex === last ? 0 : activeIndex + 1)
        : event.key === "ArrowLeft" ? (activeIndex === 0 ? last : activeIndex - 1)
          : event.key === "Home" ? 0
            : event.key === "End" ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(modes[next].value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className={styles.switch}
      role="tablist"
      aria-label="Compendium sections"
      style={{ "--mode-count": modes.length, "--mode-index": activeIndex } as React.CSSProperties}
    >
      <span className={styles.indicator} aria-hidden="true" />
      {modes.map((mode, index) => {
        const selected = index === activeIndex;
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            ref={element => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${mode.panelId}-tab`}
            aria-selected={selected}
            aria-controls={mode.panelId}
            aria-labelledby={`${mode.panelId}-label`}
            aria-describedby={`${mode.panelId}-hint`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            title={mode.hint}
            onClick={() => onChange(mode.value)}
            onKeyDown={handleKeyDown}
          >
            <Icon className={styles.icon} aria-hidden="true" />
            <span className={styles.text}>
              <span id={`${mode.panelId}-label`} className={styles.label}>{mode.label}</span>
              <span id={`${mode.panelId}-hint`} className={styles.hint}>{mode.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
