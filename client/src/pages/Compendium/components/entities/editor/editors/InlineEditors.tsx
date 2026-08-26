import React from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { ABILITY_FULL_NAMES, formatSignedNumber, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { getProficiencyBonusForCr } from "../model/calculations.js";
import { MAX_ABILITY_SCORE, MAX_LEGENDARY_COUNT, MAX_WHOLE, textProblem } from "./fieldLimits.js";
import { InlineField, parseWhole, type InlineParse } from "./InlineField.js";

export const ABILITY_ORDER: readonly AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
export const STANDARD_CRS: readonly string[] = [
  "0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, index) => String(index + 1)),
];
const CR_LIST_ID = "entity-editor-standard-crs";

export const NameEditor: React.FC = () => {
  const edit = useActiveEdit();
  return (
    <InlineField
      label="Name"
      value={edit.draft.name}
      parse={(text): InlineParse => {
        const name = text.trim();
        if (!name) return { ok: false, message: "A name is required." };
        const problem = textProblem(name, ENTITY_LIMITS.name);
        if (problem) return { ok: false, message: problem };
        return { ok: true, apply: () => edit.commit({ name }) };
      }}
    />
  );
};

export const AcEditor: React.FC = () => {
  const edit = useActiveEdit();
  return (
    <InlineField
      label="Armor Class"
      inputMode="numeric"
      value={String(edit.draft.ac)}
      parse={(text): InlineParse => {
        const ac = parseWhole(text, 0, MAX_WHOLE);
        return ac === undefined ? { ok: false, message: `A whole number from 0 to ${MAX_WHOLE}.` } : { ok: true, apply: () => edit.commit({ ac }) };
      }}
    />
  );
};

export const CrEditor: React.FC = () => {
  const edit = useActiveEdit();
  const current = edit.draft.cr ?? "";
  return (
    <>
      <datalist id={CR_LIST_ID}>
        {STANDARD_CRS.map(cr => <option key={cr} value={cr} />)}
      </datalist>
      <InlineField
        label="Challenge Rating"
        list={CR_LIST_ID}
        value={current}
        hint={text => `PB ${formatSignedNumber(getProficiencyBonusForCr(text))}`}
        parse={(text): InlineParse => {
          const cr = text.trim();
          if (cr !== "" && !STANDARD_CRS.includes(cr)) return { ok: false, message: "Use 0, 1/8, 1/4, 1/2 or 1 to 30." };
          return { ok: true, apply: () => edit.commit({ cr: cr === "" ? null : cr }) };
        }}
      />
    </>
  );
};

export const AbilityScoreEditor: React.FC<{ ability: AbilityKey }> = ({ ability }) => {
  const edit = useActiveEdit();
  const index = ABILITY_ORDER.indexOf(ability);
  return (
    <InlineField
      label={`${ABILITY_FULL_NAMES[ability]} score`}
      inputMode="numeric"
      value={String(edit.draft.abilityScores[ability])}
      neighbour={direction => {
        const next = ABILITY_ORDER[index + direction];
        return next ? `abilityScores.${next}` : undefined;
      }}
      parse={(text): InlineParse => {
        const score = parseWhole(text, 0, MAX_ABILITY_SCORE);
        return score === undefined
          ? { ok: false, message: `A whole number from 0 to ${MAX_ABILITY_SCORE}.` }
          : { ok: true, apply: () => edit.commit({ abilityScores: { ...edit.draft.abilityScores, [ability]: score } }) };
      }}
    />
  );
};

export const LegendaryCountEditor: React.FC = () => {
  const edit = useActiveEdit();
  return (
    <InlineField
      label="Legendary actions per round"
      inputMode="numeric"
      value={edit.draft.legendaryActionCount ? String(edit.draft.legendaryActionCount) : ""}
      parse={(text): InlineParse => {
        const count = text.trim() === "" ? 0 : parseWhole(text, 0, MAX_LEGENDARY_COUNT);
        return count === undefined ? { ok: false, message: `A whole number from 0 to ${MAX_LEGENDARY_COUNT}.` } : { ok: true, apply: () => edit.commit({ legendaryActionCount: count }) };
      }}
    />
  );
};
