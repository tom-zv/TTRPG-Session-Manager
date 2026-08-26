import React from "react";
import { formatSignedNumber, ABILITY_FULL_NAMES, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { getProficiencyBonusForCr, getRecordDefaultValue, type RecordEntryMode } from "../model/calculations.js";
import { SAVE_OPTIONS, SKILL_OPTIONS, type RecordOption } from "../model/options.js";
import { textProblem } from "./fieldLimits.js";
import { PopoverForm } from "./PopoverForm.js";
import styles from "../EntityEditor.module.css";

type RowMode = RecordEntryMode | "none";
type Row = { key: string; mode: RowMode; custom: string; original?: { key: string; mode: RecordEntryMode; value: string } };

const MODE_LABELS: Record<RowMode, string> = { none: "None", proficient: "Proficient", expertise: "Expertise", custom: "Custom" };

type ProficiencyEditorProps = {
  field: "saves" | "skills";
  /** A save cell edits one ability's save and leaves the rest of the record alone. */
  only?: AbilityKey;
};

/** Saves or skills: each row is a key and None, Proficient, Expertise or a custom modifier. */
export const ProficiencyEditor: React.FC<ProficiencyEditorProps> = ({ field, only }) => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const options: readonly RecordOption[] = field === "saves" ? SAVE_OPTIONS : SKILL_OPTIONS;
  const noun = field === "saves" ? "save" : "skill";
  const pb = getProficiencyBonusForCr(draft.cr);

  const [rows, setRows] = useEditorState<Row[]>("proficiency.rows", () => {
    const existing = Object.entries(draft[field] ?? {}).map(([key, value]): Row => {
      const mode = modes[field][key] ?? "custom";
      return { key, mode, custom: value, original: { key, mode, value } };
    });
    return only && !existing.some(row => row.key === only) ? [...existing, { key: only, mode: "none", custom: "" }] : existing;
  });
  const [error, setError] = useEditorState<string | null>("proficiency.error", null);
  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = options.find(option => !rows.some(row => row.key === option.value));
  const labelOf = (key: string) => options.find(option => option.value === key)?.label ?? key;

  const apply = (): boolean => {
    const record: Record<string, string> = {};
    const nextModes: Record<string, RecordEntryMode> = {};
    for (const row of rows) {
      if (row.mode === "none") continue;
      const key = row.key.trim().toLowerCase();
      if (key in record) {
        setError(`${labelOf(row.key)} is listed twice.`);
        return false;
      }
      let value: string;
      // The stored value stays only while the row still means what it did. A new key (or mode)
      // recomputes it: +2 on Strength is not +2 on Dexterity.
      const unchanged = row.original?.key === row.key && row.original.mode === row.mode;
      if (row.original && unchanged && (row.mode !== "custom" || row.custom === row.original.value)) {
        value = row.original.value;
      } else if (row.mode === "custom") {
        value = row.custom.trim();
        const problem = textProblem(value);
        if (problem) {
          setError(`${labelOf(row.key)}: ${problem}`);
          return false;
        }
        if (!value) {
          setError(`Give ${labelOf(row.key)} a modifier, or choose another mode.`);
          return false;
        }
      } else {
        const computed = getRecordDefaultValue(row.key, options, draft.abilityScores, pb, row.mode);
        if (computed === undefined) {
          setError(`${labelOf(row.key)} needs a custom modifier.`);
          return false;
        }
        value = formatSignedNumber(computed);
      }
      record[key] = value;
      nextModes[key] = row.mode;
    }
    const patch = Object.keys(record).length === 0 && !draft[field] ? draft[field] : record;
    const problem = edit.commit({ [field]: patch }, { [field]: nextModes });
    if (problem) {
      setError(problem);
      return false;
    }
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {rows.map((row, index) => (only && row.key !== only ? null : (
        <div key={index} className={styles.row}>
          {only ? (
            <span>{ABILITY_FULL_NAMES[only]} saving throw</span>
          ) : (
            <select aria-label={`${noun} ${index + 1}`} value={row.key} onChange={event => update(index, { key: event.target.value })}>
              {[...options, ...(options.some(option => option.value === row.key) ? [] : [{ value: row.key, label: row.key }])]
                .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
          <select
            aria-label={only ? `${ABILITY_FULL_NAMES[only]} save mode` : `${labelOf(row.key)} mode`}
            value={row.mode}
            onChange={event => update(index, { mode: event.target.value as RowMode })}
          >
            {(only ? (["none", "proficient", "expertise", "custom"] as const) : (["proficient", "expertise", "custom"] as const))
              .map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
          </select>
          {row.mode === "custom" && (
            <input aria-label={`${labelOf(row.key)} modifier`} value={row.custom} onChange={event => update(index, { custom: event.target.value })} />
          )}
          {!only && (
            <button type="button" aria-label={`Remove ${labelOf(row.key)}`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
          )}
        </div>
      )))}
      {!only && (
        <button type="button" disabled={!unused} onClick={() => unused && setRows([...rows, { key: unused.value, mode: "proficient", custom: "" }])}>
          + Add {noun}
        </button>
      )}
    </PopoverForm>
  );
};
