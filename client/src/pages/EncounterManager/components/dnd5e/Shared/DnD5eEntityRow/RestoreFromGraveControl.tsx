import React, { useEffect, useId, useRef, useState } from "react";
import { GiHeartBeats } from "react-icons/gi";
import { NumberStepper } from "src/components/FormControls/index.js";
import { useEscapeWithin } from "src/pages/EncounterManager/hooks/useEscapeWithin.js";
import styles from "./DnD5eEntityRow.module.css";

const MAX_HP = 9999;

type RestoreFromGraveControlProps = {
  entityName: string;
  maxHp: number;
  onRestore: (hp: number) => void;
  onCancel: () => void;
};

function parseHp(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const hp = Number(trimmed);
  return hp <= MAX_HP ? hp : null;
}

/** Inline HP picker shown in a grave row. Replaces the old `window.prompt`. */
export const RestoreFromGraveControl: React.FC<RestoreFromGraveControlProps> = ({
  entityName,
  maxHp,
  onRestore,
  onCancel,
}) => {
  const [value, setValue] = useState("1");
  const [submitted, setSubmitted] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);
  const hintId = useId();
  useEscapeWithin(containerRef, onCancel);

  useEffect(() => {
    const input = containerRef.current?.querySelector("input");
    input?.focus();
    input?.select();
  }, []);

  const hp = parseHp(value);
  const showError = submitted && hp === null;
  const presets = [
    { label: "0", value: 0 },
    { label: "1", value: 1 },
    { label: "Half", value: Math.max(1, Math.ceil(maxHp / 2)) },
    { label: "Full", value: maxHp },
  ];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hp === null) return;
    onRestore(hp);
  };

  return (
    <form
      ref={containerRef}
      className={styles.restoreControl}
      onSubmit={handleSubmit}
      aria-label={`Restore ${entityName} to initiative`}
    >
      <div className={styles.restoreField}>
        <span className={styles.statLabel}>Return with</span>
        <div className={styles.restoreInputRow}>
          <NumberStepper
            value={value}
            onChange={(next) => {
              setValue(next);
              setSubmitted(false);
            }}
            min={0}
            max={MAX_HP}
            className={styles.restoreStepper}
            aria-label={`${entityName} HP on restore`}
            aria-describedby={hintId}
            aria-invalid={showError}
          />
          <span className={styles.restoreUnit}>HP</span>
          <div className={styles.restorePresets} role="group" aria-label="HP presets">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`${styles.presetChip}${hp === preset.value ? ` ${styles.presetChipActive}` : ""}`}
                onClick={() => {
                  setValue(String(preset.value));
                  setSubmitted(false);
                }}
                title={`${preset.value} HP`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <span id={hintId} className={`${styles.restoreHint}${showError ? ` ${styles.restoreHintError}` : ""}`} role={showError ? "alert" : undefined}>
          {showError
            ? `Enter a whole number from 0 to ${MAX_HP}.`
            : hp !== null && hp > maxHp
              ? `Raises max HP to ${hp}.`
              : hp === 0
                ? "Returns at 0 HP; death saves are kept."
                : `Max HP ${maxHp}.`}
        </span>
      </div>
      <div className={styles.restoreButtons}>
        <button type="submit" className={`${styles.actionButton} ${styles.restoreButton}`}>
          <GiHeartBeats aria-hidden="true" />
          Restore
        </button>
        <button type="button" className={`${styles.actionButton} ${styles.actionButtonGhost}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};
