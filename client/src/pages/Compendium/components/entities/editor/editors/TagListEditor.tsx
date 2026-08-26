import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { TagInput, appendTag } from "src/components/FormControls/TagInput.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { LANGUAGE_PRESETS, SENSE_PRESETS } from "../model/options.js";
import { Field, PopoverForm, keepAbsent } from "./PopoverForm.js";
import { MAX_PASSIVE_PERCEPTION, textProblem } from "./fieldLimits.js";
import { parseWhole } from "./InlineField.js";

/** Senses (with passive Perception) or languages: tags, with common ones offered as presets. */
export const TagListEditor: React.FC<{ field: "senses" | "languages" }> = ({ field }) => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const [items, setItems] = useEditorState("tags.items", draft[field] ?? []);
  const [pendingText, setPendingText] = useEditorState("tags.pendingText", "");
  const [auto, setAuto] = useEditorState("tags.auto", modes.passivePerception === "auto");
  const [passive, setPassive] = useEditorState("tags.passive", String(draft.passivePerception ?? ""));
  const [error, setError] = useEditorState<string | null>("tags.error", null);

  const apply = (): boolean => {
    const tags = appendTag(items, pendingText);
    // Each sense is at most `sense` characters; every tag must be valid text, as the write contract requires.
    for (const item of tags) {
      const problem = textProblem(item, field === "senses" ? ENTITY_LIMITS.sense : undefined, true);
      if (problem) {
        setError(`${item.length > 24 ? `${[...item].slice(0, 24).join("")}…` : item}: ${problem}`);
        return false;
      }
    }
    if (field === "languages") {
      edit.commit({ languages: keepAbsent(tags, draft.languages) });
      return true;
    }
    const manual = parseWhole(passive, 0, MAX_PASSIVE_PERCEPTION);
    if (!auto && manual === undefined) {
      setError(`Passive Perception is a whole number from 0 to ${MAX_PASSIVE_PERCEPTION}.`);
      return false;
    }
    const problem = edit.commit(
      { senses: keepAbsent(tags, draft.senses), ...(auto ? {} : { passivePerception: manual }) },
      { passivePerception: auto ? "auto" : "manual" },
    );
    if (problem) {
      setError(problem);
      return false;
    }
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <TagInput
        label={field === "senses" ? "Senses" : "Languages"}
        items={items}
        onChange={setItems}
        pendingText={{ value: pendingText, onChange: setPendingText }}
        presets={field === "senses" ? SENSE_PRESETS : LANGUAGE_PRESETS}
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
