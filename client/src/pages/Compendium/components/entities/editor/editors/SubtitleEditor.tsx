import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { TagInput, appendTag } from "src/components/FormControls/TagInput.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import { ALIGNMENT_OPTIONS, CREATURE_TYPE_OPTIONS, ROLE_OPTIONS, SIZE_OPTIONS } from "../model/options.js";
import { textProblem } from "./fieldLimits.js";
import { Field, PopoverForm, clearable, keepAbsent } from "./PopoverForm.js";

/** Size, creature type, type tags, alignment and role: everything the subtitle line says. */
export const SubtitleEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const [size, setSize] = useEditorState("subtitle.size", draft.size);
  const [role, setRole] = useEditorState("subtitle.role", draft.role);
  const [creatureType, setCreatureType] = useEditorState("subtitle.creatureType", draft.creatureType ?? "");
  const [alignment, setAlignment] = useEditorState("subtitle.alignment", draft.alignment);
  const [typeTags, setTypeTags] = useEditorState("subtitle.typeTags", draft.typeTags ?? []);
  const [pendingText, setPendingText] = useEditorState("subtitle.pendingText", "");
  const [error, setError] = useEditorState<string | null>("subtitle.error", null);

  const apply = (): boolean => {
    const tags = appendTag(typeTags, pendingText);
    const checks: Array<[string, string | undefined]> = [
      ["Creature type", textProblem(creatureType, ENTITY_LIMITS.creatureType)],
      ["Alignment", textProblem(alignment, ENTITY_LIMITS.alignment)],
      ["Type tags", tags.map(tag => textProblem(tag)).find(Boolean)],
    ];
    const failed = checks.find(([, message]) => message);
    const problem = failed && `${failed[0]}: ${failed[1]}`;
    if (problem) {
      setError(problem);
      return false;
    }
    edit.commit({
      size,
      role,
      creatureType: clearable(creatureType, draft.creatureType),
      alignment: alignment.trim(),
      typeTags: keepAbsent(tags, draft.typeTags),
    });
    return true;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Size">
        {id => (
          <select id={id} value={size} onChange={event => setSize(event.target.value as typeof size)}>
            {SIZE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </Field>
      <Field label="Creature type">
        {id => (
          <>
            <input id={id} list={`${id}-types`} value={creatureType} onChange={event => setCreatureType(event.target.value)} />
            <datalist id={`${id}-types`}>
              {CREATURE_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value} />)}
            </datalist>
          </>
        )}
      </Field>
      <TagInput label="Type tags" items={typeTags} onChange={setTypeTags} pendingText={{ value: pendingText, onChange: setPendingText }} />
      <Field label="Alignment">
        {id => (
          <>
            <input id={id} list={`${id}-alignments`} value={alignment} onChange={event => setAlignment(event.target.value)} />
            <datalist id={`${id}-alignments`}>
              {ALIGNMENT_OPTIONS.map(option => <option key={option.value} value={option.value} />)}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Role">
        {id => (
          <select id={id} value={role} onChange={event => setRole(event.target.value as typeof role)}>
            {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </Field>
    </PopoverForm>
  );
};
