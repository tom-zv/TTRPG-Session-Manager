import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ComboboxInput,
  FormField,
  NumberStepper,
  TagInput,
} from "src/components/FormControls/index.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  ABILITY_LABELS,
  calcMod,
  formatSignedNumber,
} from "../../dnd5eUtils.js";
import type {
  DnD5eEntityFormDraft,
  FieldErrors,
  SpeedDraft,
} from "../DnD5eEntityForm.types.js";
import {
  ABILITY_PRESETS,
  LANGUAGE_PRESETS,
  ROLE_OPTIONS,
  SENSE_PRESETS,
  SIZE_OPTIONS,
  SPEED_TYPE_OPTIONS,
} from "../model/options.js";
import styles from "./DnD5eEntityFormSections.module.css";

type CoreColumnProps = {
  draft: DnD5eEntityFormDraft;
  fieldErrors: FieldErrors;
  proficiencyBonus: number;
  updateDraft: <Key extends keyof DnD5eEntityFormDraft>(
    key: Key,
    value: DnD5eEntityFormDraft[Key]
  ) => void;
  addSpeed: (type: string) => void;
  updateSpeed: (id: string, patch: Partial<SpeedDraft>) => void;
  removeSpeed: (id: string) => void;
  applyPreset: (label: string) => void;
};

export const CoreColumn: React.FC<CoreColumnProps> = ({
  draft,
  fieldErrors,
  proficiencyBonus,
  updateDraft,
  addSpeed,
  updateSpeed,
  removeSpeed,
  applyPreset,
}) => (
  <>
    <div className={styles.quickGrid}>
      <FormField label="Name" name="name" className={styles.nameField} error={fieldErrors.name}>
        <input
          type="text"
          value={draft.name}
          onChange={(event) => updateDraft("name", event.target.value)}
          autoComplete="off"
          required
        />
      </FormField>

      <FormField label="Role" name="role" className={styles.shortField}>
        <select
          value={draft.role}
          onChange={(event) =>
            updateDraft("role", event.target.value as DnD5eEntityDetails["role"])
          }
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="HP" name="hp" className={styles.compactField} error={fieldErrors.hp}>
        <NumberStepper
          id="hp"
          name="hp"
          min={1}
          value={draft.hp}
          onChange={(value) => updateDraft("hp", value)}
          required
        />
      </FormField>

      <FormField label="AC" name="ac" className={styles.compactField} error={fieldErrors.ac}>
        <NumberStepper
          id="ac"
          name="ac"
          min={1}
          value={draft.ac}
          onChange={(value) => updateDraft("ac", value)}
          required
        />
      </FormField>

      <FormField label="Size" name="size" className={styles.shortField}>
        <select
          value={draft.size}
          onChange={(event) =>
            updateDraft("size", event.target.value as DnD5eEntityDetails["size"])
          }
        >
          {SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="CR" name="cr" className={styles.shortField} controlId="cr">
        <div className={styles.crControl}>
          <input
            id="cr"
            name="cr"
            type="text"
            value={draft.cr}
            onChange={(event) => updateDraft("cr", event.target.value)}
            placeholder="1/4"
          />
          <span className={styles.pbBadge}>PB {formatSignedNumber(proficiencyBonus)}</span>
        </div>
      </FormField>
    </div>

    <SpeedSection
      speeds={draft.speeds}
      fieldErrors={fieldErrors}
      addSpeed={addSpeed}
      updateSpeed={updateSpeed}
      removeSpeed={removeSpeed}
    />

    <AbilityScoresSection
      draft={draft}
      fieldErrors={fieldErrors}
      updateDraft={updateDraft}
      applyPreset={applyPreset}
    />

    <div className={styles.subsection}>
      <div className={styles.subsectionHeader}>
        <h3>Senses & Languages</h3>
      </div>
      <div className={styles.gridTwo}>
        <TagInput
          label="Senses"
          name="senses"
          items={draft.senses}
          onChange={(items) => updateDraft("senses", items)}
          placeholder="darkvision 60 ft."
          presets={SENSE_PRESETS}
        />
        <TagInput
          label="Languages"
          name="languages"
          items={draft.languages}
          onChange={(items) => updateDraft("languages", items)}
          placeholder="Common"
          presets={LANGUAGE_PRESETS}
        />
      </div>
    </div>
  </>
);

const SpeedSection: React.FC<{
  speeds: SpeedDraft[];
  fieldErrors: FieldErrors;
  addSpeed: (type: string) => void;
  updateSpeed: (id: string, patch: Partial<SpeedDraft>) => void;
  removeSpeed: (id: string) => void;
}> = ({ speeds, fieldErrors, addSpeed, updateSpeed, removeSpeed }) => (
  <div className={styles.subsection}>
    <div className={styles.subsectionHeader}>
      <h3>Speed</h3>
      <div className={styles.presetRow}>
        {["walk", "climb", "swim", "fly"].map((speedType) => (
          <button
            key={speedType}
            type="button"
            className={`${styles.presetButton} ${styles.plusButton}`}
            onClick={() => addSpeed(speedType)}
          >
            <FiPlus aria-hidden="true" />
            {speedType}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.rowList}>
      {speeds.map((speed) => {
        const speedError = fieldErrors[`speeds.${speed.id}`];

        return (
          <div key={speed.id} className={styles.rowItem}>
            <div className={styles.speedRow}>
              <ComboboxInput
                id={`speed-${speed.id}-type`}
                name={`speed-${speed.id}-type`}
                options={SPEED_TYPE_OPTIONS}
                value={speed.type}
                onChange={(value) => updateSpeed(speed.id, { type: value })}
                aria-invalid={Boolean(speedError) || undefined}
                aria-describedby={speedError ? `speed-${speed.id}-error` : undefined}
                aria-label="Speed type"
                className={styles.shortControl}
                inputClassName={speedError ? styles.inputError : undefined}
                data-field={`speeds.${speed.id}`}
                clearLabel="Clear speed type"
              />
              <NumberStepper
                id={`speed-${speed.id}-value`}
                name={`speed-${speed.id}-value`}
                min={0}
                value={speed.value}
                onChange={(value) => updateSpeed(speed.id, { value })}
                aria-invalid={Boolean(speedError) || undefined}
                aria-describedby={speedError ? `speed-${speed.id}-error` : undefined}
                aria-label="Speed feet"
                className={styles.compactControl}
                inputClassName={speedError ? styles.inputError : undefined}
                data-field={`speeds.${speed.id}`}
              />
              <span className={styles.unit}>ft</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => removeSpeed(speed.id)}
                aria-label="Remove speed"
              >
                <FiTrash2 aria-hidden="true" />
              </button>
            </div>
            {speedError && (
              <div id={`speed-${speed.id}-error`} className={styles.rowError}>
                {speedError}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const AbilityScoresSection: React.FC<{
  draft: DnD5eEntityFormDraft;
  fieldErrors: FieldErrors;
  updateDraft: CoreColumnProps["updateDraft"];
  applyPreset: (label: string) => void;
}> = ({ draft, fieldErrors, updateDraft, applyPreset }) => (
  <div className={styles.subsection}>
    <div className={styles.subsectionHeader}>
      <h3>Ability Scores</h3>
      <div className={styles.presetRow}>
        {ABILITY_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`${styles.presetButton} ${styles.plusButton}`}
            onClick={() => applyPreset(preset.label)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.abilityGrid}>
      {ABILITY_KEYS.map((ability) => {
        const fieldError = fieldErrors[`abilityScores.${ability}`];
        const score = readNumber(draft.abilityScores[ability], 10);
        return (
          <label key={ability} className={styles.abilityField}>
            <span>{ABILITY_LABELS[ability]}</span>
            <NumberStepper
              id={`ability-${ability}`}
              name={`ability-${ability}`}
              min={1}
              value={draft.abilityScores[ability]}
              onChange={(value) =>
                updateDraft("abilityScores", {
                  ...draft.abilityScores,
                  [ability]: value,
                })
              }
              aria-invalid={Boolean(fieldError) || undefined}
              aria-describedby={fieldError ? `ability-${ability}-error` : undefined}
              aria-label={ABILITY_FULL_NAMES[ability]}
              inputClassName={fieldError ? styles.inputError : undefined}
              data-field={`abilityScores.${ability}`}
            />
            <strong>{formatSignedNumber(calcMod(score))}</strong>
            {fieldError && (
              <div id={`ability-${ability}-error`} className={styles.fieldError}>
                {fieldError}
              </div>
            )}
          </label>
        );
      })}
    </div>
  </div>
);

const readNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
