import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { descriptionTooLong } from "./EntryCardFrame.js";
import { Field, PopoverForm, keepAbsent } from "./PopoverForm.js";
import { textProblem } from "./fieldLimits.js";

/** The text above the legendary actions ("The dragon can take 3 legendary actions…"), one paragraph per blank line. */
export const LegendaryHeaderEditor: React.FC = () => {
  const edit = useActiveEdit();
  const original = edit.draft.legendaryHeader;
  const initial = (original ?? []).join("\n\n");
  const [text, setText] = useEditorState("legendary.text", initial);
  const [error, setError] = useEditorState<string | null>("legendary.error", null);

  const apply = (): boolean => {
    if (text === initial) return true;
    const paragraphs = text.split(/\r?\n\s*\r?\n/).map(part => part.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const problem = textProblem(paragraph) ?? (descriptionTooLong(paragraph, ENTITY_LIMITS.descriptionBytes) ? "A paragraph is too long to save." : undefined);
      if (problem) {
        setError(problem);
        return false;
      }
    }
    edit.commit({ legendaryHeader: keepAbsent(paragraphs, original) });
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Legendary introduction">
        {id => <textarea id={id} rows={4} value={text} onChange={event => { setText(event.target.value); setError(null); }} />}
      </Field>
    </PopoverForm>
  );
};
