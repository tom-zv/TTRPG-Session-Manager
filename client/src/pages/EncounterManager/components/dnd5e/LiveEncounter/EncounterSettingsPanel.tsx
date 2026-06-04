import { useCallback, useEffect, useId, useRef, useState } from "react";
import { GiCog } from "react-icons/gi";
import { ENCOUNTER_SETTINGS, type EncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";
import { patchUserPreferences } from "src/api/userPreferencesApi.js";
import type { DnD5eEncounterActions } from "../../../services/dnd5e/DnD5eEncounterActions.js";
import { ToggleSwitch } from "../Shared/ToggleSwitch/ToggleSwitch.js";
import styles from "./EncounterSettingsPanel.module.css";

/** Header gear button that opens the encounter settings popover (GM only). */
export function EncounterSettingsPanel({ settings, actions, canMutate }: {
  settings: EncounterSettings;
  actions: DnD5eEncounterActions;
  canMutate: boolean;
}) {
  const popoverId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) gearRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && anchorRef.current?.contains(event.target)) return;
      close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  const saveDefaults = async () => {
    setSaving(true);
    setMessage("");
    try {
      await patchUserPreferences({ encounterDefaults: { dnd5e: settings } });
      setMessage("Saved for new encounters.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save defaults.");
    } finally {
      setSaving(false);
    }
  };

  const zeroHpTransfer = ENCOUNTER_SETTINGS.automation.zeroHpTransfer;

  return (
    <div ref={anchorRef} className={styles.anchor}>
      <button
        ref={gearRef}
        type="button"
        className={`${styles.gearButton}${open ? ` ${styles.gearButtonOpen}` : ""}`}
        onClick={() => {
          setMessage("");
          setOpen((previous) => !previous);
        }}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label="Encounter settings"
        title="Encounter settings"
      >
        <GiCog aria-hidden="true" />
      </button>

      {open && (
        <div id={popoverId} className={styles.popover} role="dialog" aria-label="Encounter settings">
          <h2 className={styles.title}>Encounter settings</h2>
          <ToggleSwitch
            checked={settings.automation.zeroHpTransfer === "auto"}
            disabled={!canMutate}
            onChange={(checked) => {
              setMessage("");
              actions.global.updateEncounterSettings({ automation: { zeroHpTransfer: checked ? "auto" : "manual" } });
            }}
            label={zeroHpTransfer.label}
            help={zeroHpTransfer.help}
          />
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.saveButton}
              disabled={!canMutate || saving}
              onClick={() => void saveDefaults()}
            >
              {saving ? "Saving…" : "Save as my defaults"}
            </button>
            <span role="status" className={styles.message}>{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
