import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { UNCOUNTED_SPELL_FREQUENCIES } from "shared/domain/encounters/dnd5e/entity.js";
import { FormField, NumberStepper } from "src/components/FormControls/index.js";
import { createBlankSpellGroup } from "../model/draftTransforms.js";
import { SPELL_GROUP_KIND_OPTIONS } from "../model/options.js";
import type { SpellGroupDraft, SpellGroupKind } from "../DnD5eEntityForm.types.js";
import styles from "./DnD5eEntityFormRows.module.css";

type SpellGroupRowsProps = {
  blockId: string;
  groups: SpellGroupDraft[];
  onChange: (groups: SpellGroupDraft[]) => void;
};

// Spell lists of one spellcasting block: slot levels or usage frequencies ("2/day each").
export const SpellGroupRows: React.FC<SpellGroupRowsProps> = ({ blockId, groups, onChange }) => {
  const updateGroup = (id: string, patch: Partial<SpellGroupDraft>) =>
    onChange(groups.map((group) => (group.id === id ? { ...group, ...patch } : group)));

  return (
    <div className={styles.spellGroups}>
      <div className={styles.spellGroupsHeader}>
        <span>Spell lists</span>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.plusButton}`}
          onClick={() => onChange([...groups, createBlankSpellGroup(nextKind(groups))])}
        >
          <FiPlus aria-hidden="true" />
          Spell list
        </button>
      </div>
      {groups.map((group) => (
        <SpellGroupRow
          key={group.id}
          fieldId={`spellcasting-${blockId}-${group.id}`}
          group={group}
          onUpdate={(patch) => updateGroup(group.id, patch)}
          onRemove={() => onChange(groups.filter((existing) => existing.id !== group.id))}
        />
      ))}
    </div>
  );
};

const SpellGroupRow: React.FC<{
  fieldId: string;
  group: SpellGroupDraft;
  onUpdate: (patch: Partial<SpellGroupDraft>) => void;
  onRemove: () => void;
}> = ({ fieldId, group, onUpdate, onRemove }) => {
  const isLevel = group.kind === "level";
  const isCounted = group.kind !== "level" && !UNCOUNTED_SPELL_FREQUENCIES.includes(group.kind);
  const countLabel = group.kind === "recharge" ? "Recharge on" : "Uses";

  const changeKind = (kind: SpellGroupKind) =>
    onUpdate({ kind, ...(kind === "level" && !group.level.trim() ? { level: "1" } : {}) });

  return (
    <div className={styles.spellGroup}>
      <div className={styles.spellGroupControls}>
        <FormField label="List" name={`${fieldId}-kind`}>
          <select value={group.kind} onChange={(event) => changeKind(event.target.value as SpellGroupKind)}>
            {SPELL_GROUP_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        {isLevel && (
          <>
            <FormField label="Level" name={`${fieldId}-level`}>
              <NumberStepper
                id={`${fieldId}-level`}
                name={`${fieldId}-level`}
                value={group.level}
                onChange={(level) => onUpdate({ level })}
                min={0}
                max={9}
                aria-label="Spell level (0 for cantrips)"
              />
            </FormField>
            <FormField label="Slots" name={`${fieldId}-slots`}>
              <NumberStepper
                id={`${fieldId}-slots`}
                name={`${fieldId}-slots`}
                value={group.slots}
                onChange={(slots) => onUpdate({ slots })}
                min={0}
                aria-label="Spell slots"
              />
            </FormField>
          </>
        )}
        {isCounted && (
          <FormField label={countLabel} name={`${fieldId}-count`}>
            <NumberStepper
              id={`${fieldId}-count`}
              name={`${fieldId}-count`}
              value={group.count}
              onChange={(count) => onUpdate({ count })}
              min={1}
              aria-label={countLabel}
            />
          </FormField>
        )}
        {isCounted && group.kind !== "recharge" && group.kind !== "legendary" && (
          <label className={styles.spellGroupCheckbox}>
            <input
              type="checkbox"
              checked={group.each}
              onChange={(event) => onUpdate({ each: event.target.checked })}
            />
            Each
          </label>
        )}
        <button
          type="button"
          className={`${styles.iconButton} ${styles.spellGroupRemove}`}
          onClick={onRemove}
          aria-label="Remove spell list"
          title="Remove spell list"
        >
          <FiTrash2 aria-hidden="true" />
        </button>
      </div>
      <FormField label="Spells, one per line" name={`${fieldId}-spells`}>
        <textarea
          rows={3}
          value={group.spellsText}
          placeholder={"Fireball (level 5 version)\nMage Armor (included in AC)"}
          onChange={(event) => onUpdate({ spellsText: event.target.value })}
        />
      </FormField>
    </div>
  );
};

// A new list after "At will" is most often "1/day each"; otherwise continue with the last kind.
const nextKind = (groups: SpellGroupDraft[]): SpellGroupKind => {
  const last = groups.at(-1)?.kind;
  if (!last) return "will";
  return last === "will" || last === "constant" ? "daily" : last;
};
