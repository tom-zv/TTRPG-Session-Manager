import React from "react";
import { commitParse, parseSpecs } from "../../../sheetEditor/fieldSpec.js";
import { PopoverForm, SpecControl } from "../../../sheetEditor/PopoverForm.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { averageHp } from "../model/calculations.js";
import { HP_FIELD, HP_FORMULA_FIELD } from "../model/fields.js";

/** Hit points and their dice formula; the button fills HP with the formula's average. */
export const HpEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const [hp, setHp] = useEditorState("hp.hp", HP_FIELD.read(draft, modes));
  const [formula, setFormula] = useEditorState("hp.formula", HP_FORMULA_FIELD.read(draft, modes));
  const [error, setError] = useEditorState<string | null>("hp.error", null);
  const average = averageHp(formula);

  const apply = (): boolean => {
    const problem = commitParse(edit, parseSpecs([[HP_FIELD, hp], [HP_FORMULA_FIELD, formula]], draft, modes));
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <SpecControl spec={HP_FIELD} value={hp} onChange={setHp} />
      <SpecControl spec={HP_FORMULA_FIELD} value={formula} placeholder="e.g. 5d10 + 5" onChange={setFormula} />
      <button type="button" disabled={average === undefined} onClick={() => average !== undefined && setHp(String(average))}>
        {average === undefined ? "Use average" : `Use average (${average})`}
      </button>
    </PopoverForm>
  );
};
