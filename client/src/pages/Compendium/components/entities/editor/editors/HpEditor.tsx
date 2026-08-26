import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { averageHp } from "../model/calculations.js";
import { Field, PopoverForm, clearable } from "./PopoverForm.js";
import { MAX_WHOLE, textProblem } from "./fieldLimits.js";
import { parseWhole } from "./InlineField.js";

/** Hit points and their dice formula; the button fills HP with the formula's average. */
export const HpEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const [hp, setHp] = useEditorState("hp.hp", String(draft.hp));
  const [formula, setFormula] = useEditorState("hp.formula", draft.hpFormula ?? "");
  const [error, setError] = useEditorState<string | null>("hp.error", null);
  const average = averageHp(formula);

  const fail = (message: string) => {
    setError(message);
    return false;
  };
  const apply = (): boolean => {
    const value = parseWhole(hp, 0, MAX_WHOLE);
    if (value === undefined) return fail(`Hit points are a whole number from 0 to ${MAX_WHOLE}.`);
    const problem = textProblem(formula, ENTITY_LIMITS.hpFormula);
    if (problem) return fail(`Hit point formula: ${problem}`);
    edit.commit({ hp: value, hpFormula: clearable(formula, draft.hpFormula) });
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Hit points">
        {id => <input id={id} inputMode="numeric" value={hp} onChange={event => setHp(event.target.value)} />}
      </Field>
      <Field label="Hit point formula">
        {id => <input id={id} value={formula} placeholder="e.g. 5d10 + 5" onChange={event => setFormula(event.target.value)} />}
      </Field>
      <button type="button" disabled={average === undefined} onClick={() => average !== undefined && setHp(String(average))}>
        {average === undefined ? "Use average" : `Use average (${average})`}
      </button>
    </PopoverForm>
  );
};
