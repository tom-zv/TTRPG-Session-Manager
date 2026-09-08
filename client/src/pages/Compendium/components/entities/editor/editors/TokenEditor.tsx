import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { textProblem } from "./fieldLimits.js";
import { Field, PopoverForm, clearable } from "../../../sheetEditor/PopoverForm.js";

export const TokenEditor: React.FC = () => {
  const edit = useActiveEdit();
  const [url, setUrl] = useEditorState("token.url", edit.draft.imageUrl ?? "");
  const [error, setError] = useEditorState<string | null>("token.error", null);
  const fail = (message: string) => {
    setError(message);
    return false;
  };
  const apply = (): boolean => {
    const problem = textProblem(url, ENTITY_LIMITS.imageUrl);
    if (problem) return fail(`Token image URL: ${problem}`);
    edit.commit({ imageUrl: clearable(url, edit.draft.imageUrl) });
    return true;
  };
  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Token image URL">
        {id => <input id={id} value={url} onChange={event => setUrl(event.target.value)} />}
      </Field>
    </PopoverForm>
  );
};
