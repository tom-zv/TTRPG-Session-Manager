import React from "react";
import styles from "./ToggleSwitch.module.css";

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  help?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
};

/** A labelled on/off switch backed by a native checkbox (`role="switch"`). */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  help,
  disabled = false,
  title,
  className,
}) => (
  <label className={`${styles.switchRow}${disabled ? ` ${styles.disabled}` : ""}${className ? ` ${className}` : ""}`} title={title}>
    <input
      type="checkbox"
      role="switch"
      className={styles.input}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className={styles.track} aria-hidden="true">
      <span className={styles.thumb} />
    </span>
    <span className={styles.text}>
      <span className={styles.label}>{label}</span>
      {help && <small className={styles.help}>{help}</small>}
    </span>
  </label>
);
