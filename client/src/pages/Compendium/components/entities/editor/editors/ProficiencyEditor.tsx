import React from "react";
import { ABILITY_FULL_NAMES, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { commitParse } from "../../../sheetEditor/fieldSpec.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { writeRecordRows, type RecordMode, type RecordRow } from "../model/fields.js";
import { SAVE_OPTIONS, SKILL_OPTIONS, type RecordOption } from "../model/options.js";
import { AddChoice, PopoverForm } from "../../../sheetEditor/PopoverForm.js";
import styles from "../../../sheetEditor/SheetEditor.module.css";

const MODE_LABELS: Record<RecordMode, string> = { none: "None", proficient: "Proficient", expertise: "Expertise", custom: "Custom" };

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

  const [rows, setRows] = useEditorState<RecordRow[]>("proficiency.rows", () => {
    const existing = Object.entries(draft[field] ?? {}).map(([key, value]): RecordRow => {
      const mode = modes[field][key] ?? "custom";
      return { key, mode, custom: value, original: { key, mode, value } };
    });
    return only && !existing.some(row => row.key === only) ? [...existing, { key: only, mode: "none", custom: "" }] : existing;
  });
  const [error, setError] = useEditorState<string | null>("proficiency.error", null);
  const update = (index: number, patch: Partial<RecordRow>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const unused = options.filter(option => !rows.some(row => row.key === option.value));
  const labelOf = (key: string) => options.find(option => option.value === key)?.label ?? key;

  // Each row is written through the same record rules as a typed value or a mode marker.
  const apply = (): boolean => {
    const problem = commitParse(edit, writeRecordRows(draft, modes, field, rows, labelOf));
    setError(problem ?? null);
    return problem === undefined;
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
            onChange={event => update(index, { mode: event.target.value as RecordMode })}
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
        <AddChoice label={`Add ${noun}`} options={unused} onPick={key => setRows([...rows, { key, mode: "proficient", custom: "" }])} />
      )}
    </PopoverForm>
  );
};
