import React from "react";
import { TagInput, appendTag } from "src/components/FormControls/TagInput.js";
import { parseSpecs, parseTokens } from "../../../sheetEditor/fieldSpec.js";
import { PopoverForm, SpecControl } from "../../../sheetEditor/PopoverForm.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { ALIGNMENT_FIELD, CREATURE_TYPE_FIELD, ROLE_FIELD, SIZE_FIELD, TYPE_TAGS } from "../model/fields.js";

/** Size, creature type, type tags, alignment and role: everything the subtitle line says. */
export const SubtitleEditor: React.FC = () => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const [size, setSize] = useEditorState("subtitle.size", SIZE_FIELD.read(draft, modes));
  const [role, setRole] = useEditorState("subtitle.role", ROLE_FIELD.read(draft, modes));
  const [creatureType, setCreatureType] = useEditorState("subtitle.creatureType", CREATURE_TYPE_FIELD.read(draft, modes));
  const [alignment, setAlignment] = useEditorState("subtitle.alignment", ALIGNMENT_FIELD.read(draft, modes));
  const [typeTags, setTypeTags] = useEditorState("subtitle.typeTags", TYPE_TAGS.read(draft));
  const [pendingText, setPendingText] = useEditorState("subtitle.pendingText", "");
  const [error, setError] = useEditorState<string | null>("subtitle.error", null);

  const apply = (): boolean => {
    const fields = parseSpecs([[SIZE_FIELD, size], [CREATURE_TYPE_FIELD, creatureType], [ALIGNMENT_FIELD, alignment], [ROLE_FIELD, role]], draft, modes);
    const tags = parseTokens(TYPE_TAGS, appendTag(typeTags, pendingText), draft, modes);
    const problem = !fields.ok ? fields.message
      : !tags.ok ? `${TYPE_TAGS.label}: ${tags.message}`
      : edit.commit({ ...fields.patch, ...tags.patch });
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <SpecControl spec={SIZE_FIELD} value={size} onChange={setSize} />
      <SpecControl spec={CREATURE_TYPE_FIELD} value={creatureType} onChange={setCreatureType} />
      <TagInput label={TYPE_TAGS.label} items={typeTags} onChange={setTypeTags} pendingText={{ value: pendingText, onChange: setPendingText }} />
      <SpecControl spec={ALIGNMENT_FIELD} value={alignment} onChange={setAlignment} />
      <SpecControl spec={ROLE_FIELD} value={role} onChange={setRole} />
    </PopoverForm>
  );
};
