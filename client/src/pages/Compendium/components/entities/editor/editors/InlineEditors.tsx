import React, { useId } from "react";
import { formatSignedNumber, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { specParse } from "../../../sheetEditor/fieldSpec.js";
import { InlineField } from "../../../sheetEditor/InlineField.js";
import { SuggestionList } from "../../../sheetEditor/PopoverForm.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { getProficiencyBonusForCr } from "../model/calculations.js";
import {
  ABILITY_ORDER,
  AC_FIELD,
  CR_FIELD,
  LEGENDARY_COUNT_FIELD,
  NAME_FIELD,
  abilityScoreField,
  type EntityField,
} from "../model/fields.js";

type SpecInlineEditorProps = {
  spec: EntityField;
  neighbour?: (direction: 1 | -1) => string | undefined;
  hint?: (text: string) => string;
};

/** A target's inline editor for one field spec: the spec reads, parses and commits it. */
const SpecInlineEditor: React.FC<SpecInlineEditorProps> = ({ spec, neighbour, hint }) => {
  const edit = useActiveEdit();
  const listId = useId();
  return (
    <>
      {spec.suggestions && <SuggestionList id={listId} options={spec.suggestions} />}
      <InlineField
        label={spec.label}
        value={spec.read(edit.draft, edit.modes)}
        inputMode={spec.inputMode}
        list={spec.suggestions ? listId : undefined}
        neighbour={neighbour}
        hint={hint}
        parse={specParse(spec, edit)}
      />
    </>
  );
};

export const NameEditor: React.FC = () => <SpecInlineEditor spec={NAME_FIELD} />;

/** A trait's or action's name, on touch and narrow screens. */
export const EntryNameEditor: React.FC<{ spec: EntityField }> = ({ spec }) => <SpecInlineEditor spec={spec} />;

export const AcEditor: React.FC = () => <SpecInlineEditor spec={AC_FIELD} />;

export const CrEditor: React.FC = () => (
  <SpecInlineEditor spec={CR_FIELD} hint={text => `PB ${formatSignedNumber(getProficiencyBonusForCr(text))}`} />
);

export const AbilityScoreEditor: React.FC<{ ability: AbilityKey }> = ({ ability }) => {
  const index = ABILITY_ORDER.indexOf(ability);
  return (
    <SpecInlineEditor
      spec={abilityScoreField(ability)}
      neighbour={direction => {
        const next = ABILITY_ORDER[index + direction];
        return next ? `abilityScores.${next}` : undefined;
      }}
    />
  );
};

export const LegendaryCountEditor: React.FC = () => <SpecInlineEditor spec={LEGENDARY_COUNT_FIELD} />;
