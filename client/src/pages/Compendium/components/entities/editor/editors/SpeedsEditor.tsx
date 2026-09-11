import React from "react";
import { useActiveEdit } from "../EntityEditContext.js";
import { commitParse } from "../../../sheetEditor/fieldSpec.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { SPEED_TYPE_OPTIONS } from "../model/options.js";
import styles from "../../../sheetEditor/SheetEditor.module.css";
import { AddChoice, PopoverForm } from "../../../sheetEditor/PopoverForm.js";
import { parseSpeedRows, type SpeedRow } from "../model/fields.js";

export const SpeedsEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const [rows, setRows] = useEditorState<SpeedRow[]>("speeds.rows", () => Object.entries(draft.speeds ?? {}).map(([type, feet]) => ({ type, feet: String(feet) })));
  const [error, setError] = useEditorState<string | null>("speeds.error", null);
  const update = (index: number, patch: Partial<SpeedRow>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = SPEED_TYPE_OPTIONS.filter(option => !rows.some(row => row.type === option.value));

  // Each row commits through the same speed field the live sheet uses.
  const apply = (): boolean => {
    const problem = commitParse(edit, parseSpeedRows(rows, draft, modes));
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <select aria-label={`Speed type ${index + 1}`} value={row.type} onChange={event => update(index, { type: event.target.value })}>
            {[...SPEED_TYPE_OPTIONS, ...(SPEED_TYPE_OPTIONS.some(option => option.value === row.type) ? [] : [{ value: row.type, label: row.type }])]
              .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label={`Feet ${index + 1}`} data-sheet-field-id={`speeds.${row.type}`} inputMode="numeric" value={row.feet} onChange={event => update(index, { feet: event.target.value })} />
          <button type="button" aria-label={`Remove ${row.type} speed`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>
      ))}
      <AddChoice label="Add speed" fieldId="speeds" options={unused} onPick={type => setRows([...rows, { type, feet: "30" }])} />
    </PopoverForm>
  );
};
