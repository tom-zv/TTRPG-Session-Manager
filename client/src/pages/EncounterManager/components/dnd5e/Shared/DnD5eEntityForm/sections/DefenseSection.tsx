import React from "react";
import type {
  ConditionImmunityDraft,
  DamageModifierDraft,
} from "../DnD5eEntityForm.types.js";
import { CONDITION_OPTIONS, DAMAGE_TYPE_OPTIONS } from "../model/options.js";
import { OptionNoteRows } from "../rows/index.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";
import styles from "./DnD5eEntityFormSections.module.css";

const DAMAGE_GROUPS = [
  { title: "Vulnerabilities", key: "vulnerabilities", prefix: "vulnerability" },
  { title: "Resistances", key: "resistances", prefix: "resistance" },
  { title: "Immunities", key: "immunities", prefix: "immunity" },
] as const;

export const DefenseSection: React.FC<AdvancedSectionsProps> = ({
  draft,
  appendDamageModifier,
  updateDamageModifier,
  removeDamageModifier,
  appendConditionImmunity,
  updateConditionImmunity,
  removeConditionImmunity,
  getRowError,
}) => (
  <>
    <div className={styles.defenseGrid}>
      {DAMAGE_GROUPS.map(({ title, key, prefix }) => (
        <OptionNoteRows<DamageModifierDraft>
          key={key}
          title={title}
          fieldPrefix={key}
          addLabel="Add"
          optionField="damageType"
          noteField="conditionNote"
          options={DAMAGE_TYPE_OPTIONS}
          rows={draft[key]}
          optionPlaceholder="Damage type"
          notePlaceholder="from nonmagical attacks"
          composerError={`${title} need a damage type.`}
          optionAriaLabel={`${title} damage type`}
          noteAriaLabel={`${title} note`}
          clearLabel={`Clear ${title.toLowerCase()} damage type`}
          onAdd={(row) => appendDamageModifier(key, prefix, row as Omit<DamageModifierDraft, "id">)}
          onUpdate={(id, patch) => updateDamageModifier(key, id, patch)}
          onRemove={(id) => removeDamageModifier(key, id)}
          getError={(id) => getRowError(key, id)}
        />
      ))}
    </div>
    <OptionNoteRows<ConditionImmunityDraft>
      title="Condition Immunities"
      fieldPrefix="condition-immunities"
      addLabel="Condition"
      optionField="conditionName"
      noteField="conditionNote"
      options={CONDITION_OPTIONS}
      rows={draft.conditionImmunities}
      optionPlaceholder="Condition"
      notePlaceholder="optional note"
      composerError="Condition immunities need a condition."
      optionAriaLabel="Condition immunity"
      noteAriaLabel="Condition immunity note"
      clearLabel="Clear condition immunity"
      onAdd={(row) => appendConditionImmunity(row as Omit<ConditionImmunityDraft, "id">)}
      onUpdate={updateConditionImmunity}
      onRemove={removeConditionImmunity}
      getError={(id) => getRowError("conditionImmunities", id)}
    />
  </>
);
