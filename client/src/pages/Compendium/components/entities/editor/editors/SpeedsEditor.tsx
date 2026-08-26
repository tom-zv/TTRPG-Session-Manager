import React from "react";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { SPEED_TYPE_OPTIONS } from "../model/options.js";
import styles from "../EntityEditor.module.css";
import { PopoverForm } from "./PopoverForm.js";
import { MAX_WHOLE } from "./fieldLimits.js";
import { parseWhole } from "./InlineField.js";

type SpeedRow = { type: string; feet: string };

export const SpeedsEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const [rows, setRows] = useEditorState<SpeedRow[]>("speeds.rows", () => Object.entries(draft.speeds ?? {}).map(([type, feet]) => ({ type, feet: String(feet) })));
  const [error, setError] = useEditorState<string | null>("speeds.error", null);
  const update = (index: number, patch: Partial<SpeedRow>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = SPEED_TYPE_OPTIONS.find(option => !rows.some(row => row.type === option.value));

  const fail = (message: string) => {
    setError(message);
    return false;
  };
  const apply = (): boolean => {
    const speeds: Record<string, number> = {};
    for (const row of rows) {
      const feet = parseWhole(row.feet, 0, MAX_WHOLE);
      if (feet === undefined) return fail(`Speed for ${row.type} must be a whole number of feet.`);
      if (row.type in speeds) return fail(`Speed type ${row.type} is listed twice.`);
      speeds[row.type] = feet;
    }
    edit.commit({ speeds: rows.length === 0 && !draft.speeds ? draft.speeds : speeds });
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <select aria-label={`Speed type ${index + 1}`} value={row.type} onChange={event => update(index, { type: event.target.value })}>
            {[...SPEED_TYPE_OPTIONS, ...(SPEED_TYPE_OPTIONS.some(option => option.value === row.type) ? [] : [{ value: row.type, label: row.type }])]
              .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label={`Feet ${index + 1}`} inputMode="numeric" value={row.feet} onChange={event => update(index, { feet: event.target.value })} />
          <button type="button" aria-label={`Remove ${row.type} speed`} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>
      ))}
      <button type="button" disabled={!unused} onClick={() => unused && setRows([...rows, { type: unused.value, feet: "30" }])}>+ Add speed</button>
    </PopoverForm>
  );
};
