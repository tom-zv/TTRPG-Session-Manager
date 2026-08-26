import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { CONDITION_OPTIONS, DAMAGE_TYPE_OPTIONS } from "../model/options.js";
import { textProblem } from "./fieldLimits.js";
import { PopoverForm } from "./PopoverForm.js";
import styles from "../EntityEditor.module.css";

export type DefenseField = "resistances" | "immunities" | "vulnerabilities" | "conditionImmunities";
type Row = { name: string; note: string };

const NOUNS: Record<DefenseField, string> = {
  resistances: "resistance",
  immunities: "immunity",
  vulnerabilities: "vulnerability",
  conditionImmunities: "condition immunity",
};

/** One defense line: rows of a damage type (or condition) and an optional note. */
export const DefenseEditor: React.FC<{ field: DefenseField }> = ({ field }) => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const isCondition = field === "conditionImmunities";
  const options = isCondition ? CONDITION_OPTIONS : DAMAGE_TYPE_OPTIONS;
  const noun = NOUNS[field];

  const [rows, setRows] = useEditorState<Row[]>("defense.rows", () =>
    (draft[field] ?? []).map(entry => ({
      name: "damageType" in entry ? entry.damageType : entry.conditionName,
      note: entry.conditionNote ?? "",
    })));
  const [error, setError] = useEditorState<string | null>("defense.error", null);
  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = options.find(option => !rows.some(row => row.name === option.value));

  const apply = (): boolean => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.name.toLowerCase())) {
        setError(`${row.name} is listed twice.`);
        return false;
      }
      seen.add(row.name.toLowerCase());
      const problem = textProblem(row.note, ENTITY_LIMITS.conditionNote);
      if (problem) {
        setError(`Note for ${row.name}: ${problem}`);
        return false;
      }
    }
    const unchanged = rows.length === 0 && !draft[field];
    const note = (row: Row) => (row.note.trim() ? { conditionNote: row.note.trim() } : {});
    if (unchanged) return true;
    if (field === "conditionImmunities") {
      edit.commit({ conditionImmunities: rows.map(row => ({ conditionName: row.name, ...note(row) })) });
    } else {
      edit.commit({ [field]: rows.map(row => ({ damageType: row.name, ...note(row) })) });
    }
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <select aria-label={`${noun} ${index + 1}`} value={row.name} onChange={event => update(index, { name: event.target.value })}>
            {[...options, ...(options.some(option => option.value === row.name) ? [] : [{ value: row.name, label: row.name }])]
              .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label={`${noun} ${index + 1} note`} placeholder="Note" value={row.note} onChange={event => update(index, { note: event.target.value })} />
          <button type="button" aria-label={`Remove ${row.name}`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>
      ))}
      <button type="button" disabled={!unused} onClick={() => unused && setRows([...rows, { name: unused.value, note: "" }])}>
        + Add {noun}
      </button>
    </PopoverForm>
  );
};
