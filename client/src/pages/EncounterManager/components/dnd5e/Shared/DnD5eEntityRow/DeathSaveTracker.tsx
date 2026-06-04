import React from "react";
import styles from "./DeathSaveTracker.module.css";

const PIPS = [1, 2, 3] as const;

type DeathSaveTrackerProps = {
  entityName: string;
  successes: number;
  failures: number;
  /** Omit for a read-only display. */
  onChange?: (successes: number, failures: number) => void;
};

type PipGroupProps = {
  kind: "success" | "failure";
  entityName: string;
  count: number;
  onSet?: (count: number) => void;
};

const PipGroup: React.FC<PipGroupProps> = ({ kind, entityName, count, onSet }) => {
  const noun = kind === "success" ? "successes" : "failures";
  return (
    <span
      className={`${styles.pipGroup} ${kind === "success" ? styles.success : styles.failure}`}
      role="group"
      aria-label={`${entityName} death save ${noun}: ${count} of 3`}
    >
      <span className={styles.pipLabel} aria-hidden="true">{kind === "success" ? "✓" : "✕"}</span>
      {PIPS.map((pip) => {
        const filled = pip <= count;
        const className = `${styles.pip}${filled ? ` ${styles.filled}` : ""}`;
        if (!onSet) return <span key={pip} className={className} aria-hidden="true" />;
        // Clicking the highest filled pip steps back one, so every count is reachable with one click.
        const next = pip === count ? pip - 1 : pip;
        return (
          <button
            key={pip}
            type="button"
            className={className}
            aria-pressed={filled}
            aria-label={`Set ${noun} to ${next}`}
            title={`Set ${noun} to ${next}`}
            onClick={() => onSet(next)}
          />
        );
      })}
    </span>
  );
};

/** Three success and three failure pips. Clicking sets the count directly. */
export const DeathSaveTracker: React.FC<DeathSaveTrackerProps> = ({ entityName, successes, failures, onChange }) => (
  <div className={styles.tracker}>
    <span className={styles.trackerLabel}>Death saves</span>
    <PipGroup
      kind="success"
      entityName={entityName}
      count={successes}
      onSet={onChange && ((value) => onChange(value, failures))}
    />
    <PipGroup
      kind="failure"
      entityName={entityName}
      count={failures}
      onSet={onChange && ((value) => onChange(successes, value))}
    />
    {onChange && (successes > 0 || failures > 0) && (
      <button
        type="button"
        className={styles.clearButton}
        onClick={() => onChange(0, 0)}
        aria-label={`Clear ${entityName} death saves`}
        title="Clear death saves"
      >
        Clear
      </button>
    )}
  </div>
);
