import React from "react";
import { TagInput, appendTag } from "src/components/FormControls/TagInput.js";
import { parseTokens } from "../../../sheetEditor/fieldSpec.js";
import { Field, PopoverForm } from "../../../sheetEditor/PopoverForm.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { LANGUAGES, PASSIVE_PERCEPTION_FIELD, SENSES } from "../model/fields.js";

/** Senses (with passive Perception) or languages: tags, with common ones offered as presets. */
export const TagListEditor: React.FC<{ field: "senses" | "languages" }> = ({ field }) => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const spec = field === "senses" ? SENSES : LANGUAGES;
  const [items, setItems] = useEditorState("tags.items", spec.read(draft));
  const [pendingText, setPendingText] = useEditorState("tags.pendingText", "");
  const [auto, setAuto] = useEditorState("tags.auto", modes.passivePerception === "auto");
  const [passive, setPassive] = useEditorState("tags.passive", String(draft.passivePerception ?? ""));
  const [error, setError] = useEditorState<string | null>("tags.error", null);

  const apply = (): boolean => {
    const tags = parseTokens(spec, appendTag(items, pendingText), draft, modes);
    // Blank, or a value equal to the computed one, is automatic, as on the live sheet.
    const perception = field === "senses" ? PASSIVE_PERCEPTION_FIELD.parse(auto ? "" : passive, draft, modes) : undefined;
    const problem = !tags.ok ? tags.message
      : perception && !perception.ok ? `${PASSIVE_PERCEPTION_FIELD.label}: ${perception.message}`
      : edit.commit({ ...tags.patch, ...perception?.patch }, perception?.modes);
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <TagInput
        label={spec.label}
        items={items}
        onChange={setItems}
        pendingText={{ value: pendingText, onChange: setPendingText }}
        presets={spec.suggestions?.map(option => option.value)}
      />
      {field === "senses" && (
        <>
          <label>
            <input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} /> Passive Perception from Perception
          </label>
          {!auto && <Field label="Passive Perception">{id => <input id={id} inputMode="numeric" value={passive} onChange={event => setPassive(event.target.value)} />}</Field>}
        </>
      )}
    </PopoverForm>
  );
};
