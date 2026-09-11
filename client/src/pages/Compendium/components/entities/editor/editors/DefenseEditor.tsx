import React from "react";
import { commitParse } from "../../../sheetEditor/fieldSpec.js";
import { AddChoice, PopoverForm } from "../../../sheetEditor/PopoverForm.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import styles from "../../../sheetEditor/SheetEditor.module.css";
import { useActiveEdit } from "../EntityEditContext.js";
import {
  DEFENSE_NOUNS,
  defenseOptions,
  defenseRows,
  parseDefenseRows,
  type DefenseField,
  type DefenseRow,
} from "../model/fields.js";

/** One defense line: rows of a damage type (or condition) and an optional note. */
export const DefenseEditor: React.FC<{ field: DefenseField }> = ({ field }) => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const options = defenseOptions(field);
  const noun = DEFENSE_NOUNS[field];

  const [rows, setRows] = useEditorState<DefenseRow[]>("defense.rows", () => defenseRows(field, draft));
  const [error, setError] = useEditorState<string | null>("defense.error", null);
  const update = (index: number, patch: Partial<DefenseRow>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = options.filter(option => !rows.some(row => row.name === option.value));

  // The same rules as the live tokens: a type once, a changed row checked, stored rows kept as stored.
  const apply = (): boolean => {
    const problem = commitParse(edit, parseDefenseRows(field, rows, draft));
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <select aria-label={`${noun} ${index + 1}`} data-sheet-field-id={`${field}.${index}.${field === "conditionImmunities" ? "conditionName" : "damageType"}`} value={row.name} onChange={event => update(index, { name: event.target.value })}>
            {[...options, ...(options.some(option => option.value === row.name) ? [] : [{ value: row.name, label: row.name }])]
              .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label={`${noun} ${index + 1} note`} data-sheet-field-id={`${field}.${index}.conditionNote`} placeholder="Note" value={row.note} onChange={event => update(index, { note: event.target.value })} />
          <button type="button" aria-label={`Remove ${row.name}`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>
      ))}
      <AddChoice label={`Add ${noun}`} options={unused} onPick={name => setRows([...rows, { name, note: "" }])} />
    </PopoverForm>
  );
};
