import React from "react";
import { TagInput, appendTag } from "src/components/FormControls/TagInput.js";
import { parseSpecs, parseTokens, type FieldParse, type FieldSpec, type TokenListSpec } from "./fieldSpec.js";
import { PopoverForm, SpecControl } from "./PopoverForm.js";
import { useActiveSheetEdit, useEditorState } from "./SheetEditContext.js";

type SpecsEditorProps<Draft, Modes> = {
  /** The fields the editor shows, committed together in this order. */
  specs: ReadonlyArray<FieldSpec<Draft, Modes>>;
  /** Token lists after the fields, each a tag input with its suggestions as presets. */
  tokens?: ReadonlyArray<TokenListSpec<Draft, Modes>>;
  /** More controls after the fields, such as a Remove button. */
  children?: React.ReactNode;
};

/**
 * A target's popover editor drawn from field specs: one control per spec and a tag input per token
 * list. Done commits them as one edit; a failure names its field and keeps the editor open.
 */
export function SpecsEditor<Draft, Modes>({ specs, tokens = [], children }: SpecsEditorProps<Draft, Modes>): React.ReactElement {
  const edit = useActiveSheetEdit<Draft, Modes>();
  const { draft, modes } = edit;
  const [texts, setTexts] = useEditorState<Record<string, string>>(
    "specs.texts",
    () => Object.fromEntries(specs.map(spec => [spec.id, spec.read(draft, modes)])),
  );
  const [lists, setLists] = useEditorState<Record<string, string[]>>(
    "specs.lists",
    () => Object.fromEntries(tokens.map(spec => [spec.id, spec.read(draft)])),
  );
  const [pending, setPending] = useEditorState<Record<string, string>>("specs.pending", {});
  const [error, setError] = useEditorState<string | null>("specs.error", null);

  const apply = (): boolean => {
    const fields = parseSpecs(specs.map(spec => [spec, texts[spec.id] ?? ""] as const), draft, modes);
    if (!fields.ok) {
      setError(fields.message);
      return false;
    }
    let patch = fields.patch;
    let next = { ...draft, ...patch };
    for (const spec of tokens) {
      const result: FieldParse<Draft, Modes> = parseTokens(spec, appendTag(lists[spec.id] ?? [], pending[spec.id] ?? ""), next, modes);
      if (!result.ok) {
        setError(`${spec.label}: ${result.message}`);
        return false;
      }
      patch = { ...patch, ...result.patch };
      next = { ...next, ...result.patch };
    }
    const problem = edit.commit(patch, fields.modes);
    setError(problem ?? null);
    return problem === undefined;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      {specs.map(spec => (
        <SpecControl
          key={spec.id}
          spec={spec}
          value={texts[spec.id] ?? ""}
          placeholder={spec.placeholder}
          onChange={value => {
            setTexts(current => ({ ...current, [spec.id]: value }));
            setError(null);
          }}
        />
      ))}
      {tokens.map(spec => (
        <TagInput
          key={spec.id}
          label={spec.label}
          sheetFieldId={spec.id}
          items={lists[spec.id] ?? []}
          onChange={items => setLists(current => ({ ...current, [spec.id]: items }))}
          pendingText={{
            value: pending[spec.id] ?? "",
            onChange: value => setPending(current => ({ ...current, [spec.id]: value })),
          }}
          presets={spec.suggestions?.map(option => option.value)}
        />
      ))}
      {children}
    </PopoverForm>
  );
}
