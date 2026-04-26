import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import {
  FormField,
  NumberStepper,
} from "src/components/FormControls/index.js";
import {
  getSpellAttackBonus,
  getSpellSaveDc,
} from "../model/calculations.js";
import {
  SPELLCASTING_ABILITY_OPTIONS,
  SPELLCASTING_DISPLAY_OPTIONS,
} from "../model/options.js";
import type {
  AbilityScoresDraft,
  SpellcastingDraft,
} from "../DnD5eEntityForm.types.js";
import styles from "./DnD5eEntityFormRows.module.css";

type SpellcastingRowsProps = {
  rows: SpellcastingDraft[];
  abilityScores: AbilityScoresDraft;
  proficiencyBonus: number;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SpellcastingDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const SpellcastingRows: React.FC<SpellcastingRowsProps> = ({
  rows,
  abilityScores,
  proficiencyBonus,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>Spellcasting Blocks</h4>
      <button type="button" className={`${styles.toolButton} ${styles.plusButton}`} onClick={onAdd}>
        <FiPlus aria-hidden="true" />
        Spellcasting
      </button>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => (
        <SpellcastingCard
          key={row.id}
          row={row}
          abilityScores={abilityScores}
          proficiencyBonus={proficiencyBonus}
          error={getError?.(row.id)}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  </div>
);

const SpellcastingCard: React.FC<{
  row: SpellcastingDraft;
  abilityScores: AbilityScoresDraft;
  proficiencyBonus: number;
  error?: string;
  onUpdate: (id: string, patch: Partial<SpellcastingDraft>) => void;
  onRemove: (id: string) => void;
}> = ({ row, abilityScores, proficiencyBonus, error, onUpdate, onRemove }) => {
  const errorId = `spellcasting-${row.id}-error`;
  const updateAbility = (ability: string) => {
    const currentSaveDc = getSpellSaveDc(row.ability, abilityScores, proficiencyBonus);
    const currentAttackBonus = getSpellAttackBonus(row.ability, abilityScores, proficiencyBonus);
    const nextSaveDc = getSpellSaveDc(ability, abilityScores, proficiencyBonus);
    const nextAttackBonus = getSpellAttackBonus(ability, abilityScores, proficiencyBonus);
    const patch: Partial<SpellcastingDraft> = { ability };

    if (!row.saveDc.trim() || row.saveDc === currentSaveDc) patch.saveDc = nextSaveDc;
    if (!row.spellAttackBonus.trim() || row.spellAttackBonus === currentAttackBonus) {
      patch.spellAttackBonus = nextAttackBonus;
    }

    onUpdate(row.id, patch);
  };

  return (
    <div className={styles.entryCard}>
      <div className={styles.gridTwo}>
        <FormField label="Name" name={`spellcasting-${row.id}-name`}>
          <input
            type="text"
            value={row.name}
            onChange={(event) => onUpdate(row.id, { name: event.target.value })}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error) || undefined}
            className={error ? styles.inputError : undefined}
            data-field={`spellcasting.${row.id}`}
          />
        </FormField>
        <FormField label="Display As" name={`spellcasting-${row.id}-display-as`}>
          <select
            value={row.displayAs}
            onChange={(event) => onUpdate(row.id, { displayAs: event.target.value })}
          >
            {SPELLCASTING_DISPLAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Ability" name={`spellcasting-${row.id}-ability`}>
          <select value={row.ability} onChange={(event) => updateAbility(event.target.value)}>
            {SPELLCASTING_ABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className={styles.inlineControl}>
          <FormField label="Save DC" name={`spellcasting-${row.id}-save-dc`}>
            <NumberStepper
              id={`spellcasting-${row.id}-save-dc`}
              name={`spellcasting-${row.id}-save-dc`}
              value={row.saveDc}
              onChange={(value) => onUpdate(row.id, { saveDc: value })}
              min={0}
              aria-label="Spell save DC"
            />
          </FormField>
          <FormField label="Attack" name={`spellcasting-${row.id}-attack`}>
            <NumberStepper
              id={`spellcasting-${row.id}-attack`}
              name={`spellcasting-${row.id}-attack`}
              value={row.spellAttackBonus}
              onChange={(value) => onUpdate(row.id, { spellAttackBonus: value })}
              format="signed"
              aria-label="Spell attack bonus"
            />
          </FormField>
        </div>
      </div>
      <FormField label="Descriptions" name={`spellcasting-${row.id}-descriptions`}>
        <textarea
          rows={4}
          value={row.descriptionsText}
          onChange={(event) => onUpdate(row.id, { descriptionsText: event.target.value })}
          aria-describedby={error ? errorId : undefined}
        />
      </FormField>
      {error && (
        <div id={errorId} className={styles.rowError}>
          {error}
        </div>
      )}
      <div className={styles.entryCardActions}>
        <button type="button" className={styles.secondaryButton} onClick={() => onRemove(row.id)}>
          <FiTrash2 aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  );
};
