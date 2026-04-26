import React, { useId, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import styles from "./FormControls.module.css";
import { joinClassNames, toFieldName } from "./utils.js";

type TagInputProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  presets?: string[];
  name?: string;
  className?: string;
};

export const TagInput: React.FC<TagInputProps> = ({
  label,
  items,
  onChange,
  placeholder,
  presets = [],
  name,
  className,
}) => {
  const [value, setValue] = useState("");
  const [presetValue, setPresetValue] = useState("");
  const generatedId = useId();
  const controlName = name ?? toFieldName(label);
  const idSuffix = generatedId.replace(/:/g, "");
  const labelId = `${controlName}-${idSuffix}-label`;
  const inputId = `${controlName}-${idSuffix}-draft`;
  const presetId = `${controlName}-${idSuffix}-preset`;

  const addItem = (nextValue = value) => {
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    const exists = items.some((item) => item.toLowerCase() === trimmed.toLowerCase());
    if (!exists) onChange([...items, trimmed]);
    setValue("");
  };

  const addPreset = () => {
    addItem(presetValue);
    setPresetValue("");
  };

  return (
    <div className={joinClassNames(styles.tagField, className)}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={styles.tagList}>
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className={styles.tag}>
            {item}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`Remove ${item}`}
            >
              <FiX aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.inlineControl}>
        <input
          id={inputId}
          type="text"
          name={`${controlName}-draft`}
          aria-labelledby={labelId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className={styles.toolButton} onClick={() => addItem()}>
          <FiPlus aria-hidden="true" />
          Add
        </button>
      </div>
      {presets.length > 0 && (
        <div className={styles.presetSelectRow}>
          <select
            id={presetId}
            name={`${controlName}-preset`}
            value={presetValue}
            onChange={(event) => setPresetValue(event.target.value)}
            aria-label={`${label} preset`}
          >
            <option value="">Preset</option>
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.toolButton}
            onClick={addPreset}
            disabled={!presetValue}
          >
            <FiPlus aria-hidden="true" />
            Add Preset
          </button>
        </div>
      )}
    </div>
  );
};
