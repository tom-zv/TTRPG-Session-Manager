import React from "react";
import { formatRecordEntries } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import { ABILITY_FULL_NAMES, titleCase, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { commitParse } from "../../sheetEditor/fieldSpec.js";
import {
  LiveModeMarker,
  LiveSelect,
  LiveSpecField,
  LiveTokenList,
  RemoveLiveEntry,
  type ModeMarkerLook,
} from "../../sheetEditor/live/LiveField.js";
import liveStyles from "../../sheetEditor/live/LiveFields.module.css";
import { useActiveEdit } from "./EntityEditContext.js";
import { averageHp } from "./model/calculations.js";
import {
  AC_FIELD,
  ALIGNMENT_FIELD,
  CREATURE_TYPE_FIELD,
  CR_FIELD,
  HP_FIELD,
  HP_FORMULA_FIELD,
  LANGUAGES,
  NAME_FIELD,
  PASSIVE_PERCEPTION_FIELD,
  RECORD_MODE_NAMES,
  ROLE_FIELD,
  SENSES,
  SIZE_FIELD,
  TYPE_TAGS,
  abilityScoreField,
  defenseTokens,
  nextRecordMode,
  recordMode,
  saveField,
  skillField,
  skillLabel,
  speedField,
  writeRecord,
  type DefenseField,
  type RecordMode,
} from "./model/fields.js";
import type { ProficiencyField } from "./model/inference.js";
import { SKILL_OPTIONS, SPEED_TYPE_OPTIONS } from "./model/options.js";

// The entity sheet's values as live fields (the `live` presentation). Each draws a spec from
// `model/fields.ts`; the targets presentation draws the same specs inside its editors.

export const LiveName: React.FC = () => <LiveSpecField spec={NAME_FIELD} />;

/**
 * "Medium Humanoid (elf), neutral good": each part is its own field, in the order the line reads.
 */
export const LiveSubtitle: React.FC = () => {
  const { draft } = useActiveEdit();
  const tags = draft.typeTags ?? [];
  const tagList = <LiveTokenList spec={TYPE_TAGS} addLabel="+ tag" />;
  return (
    <>
      <LiveSpecField spec={SIZE_FIELD} />{" "}
      <LiveSpecField spec={CREATURE_TYPE_FIELD} className={liveStyles.capitalize} />
      {tags.length > 0 ? <>{" ("}{tagList}{")"}</> : tagList}
      {", "}
      <LiveSpecField spec={ALIGNMENT_FIELD} />
    </>
  );
};

export const LiveRole: React.FC = () => <LiveSpecField spec={ROLE_FIELD} />;

export const LiveAc: React.FC = () => <LiveSpecField spec={AC_FIELD} />;

/** "45 (6d8 + 18)": hit points, then the formula, with "Use average" floating under the pair. */
export const LiveHp: React.FC = () => {
  const edit = useActiveEdit();
  const { draft } = edit;
  const formula = draft.hpFormula ?? "";
  const average = averageHp(formula);
  const formulaField = <LiveSpecField spec={HP_FORMULA_FIELD} />;
  return (
    <span className={liveStyles.group}>
      <LiveSpecField spec={HP_FIELD} />
      {formula ? <>{" ("}{formulaField}{")"}</> : <>{" "}{formulaField}</>}
      {average !== undefined && average !== draft.hp && (
        <button type="button" className={liveStyles.aside} onClick={() => edit.claim() && edit.commit({ hp: average })}>
          Use average ({average})
        </button>
      )}
    </span>
  );
};

/**
 * Each speed has its own distance and remove button. Adding a movement type focuses its distance.
 */
export const LiveSpeeds: React.FC = () => {
  const edit = useActiveEdit();
  const speeds = edit.draft.speeds ?? {};
  const types = Object.keys(speeds).filter(type => type !== "walk");
  if ("walk" in speeds) types.unshift("walk");
  const unused = SPEED_TYPE_OPTIONS.filter(option => !(option.value in speeds));
  return (
    <>
      {types.map((type, index) => (
        <span key={type} className={liveStyles.entry}>
          {type !== "walk" && `${titleCase(type)} `}
          <LiveSpecField spec={speedField(type)} keepWhenBlank /> ft.
          <RemoveLiveEntry
            label={`Remove ${type} speed`}
            onRemove={() => commitParse(edit, speedField(type).parse("", edit.draft, edit.modes))}
            focusId={types[index + 1] ? `speeds.${types[index + 1]}` : "speeds"}
          />
        </span>
      ))}
      {unused.length > 0 && (
        <LiveSelect
          id="speeds"
          label="Add a speed"
          value=""
          prompt="+ Add"
          options={unused}
          onChange={type => {
            const problem = edit.commit({ speeds: { ...speeds, [type]: 30 } });
            if (!problem) edit.requestLiveFocus(`speeds.${type}`);
            return problem;
          }}
        />
      )}
    </>
  );
};

export const LiveCr: React.FC = () => <LiveSpecField spec={CR_FIELD} />;

export const LiveAbilityScore: React.FC<{ ability: AbilityKey }> = ({ ability }) => <LiveSpecField spec={abilityScoreField(ability)} />;

const MARKER_LOOKS: Record<RecordMode, ModeMarkerLook> = { none: "empty", proficient: "filled", expertise: "double", custom: "other" };

/** The marker that cycles a save's or skill's mode; a typed value takes whichever mode it equals. */
const RecordMarker: React.FC<{ field: ProficiencyField; recordKey: string; label: string; inline?: boolean }> = ({ field, recordKey, label, inline }) => {
  const edit = useActiveEdit();
  const mode = recordMode(edit.draft, edit.modes, field, recordKey);
  const next = nextRecordMode(field, mode);
  return (
    <LiveModeMarker
      label={label}
      current={RECORD_MODE_NAMES[mode]}
      next={RECORD_MODE_NAMES[next]}
      look={MARKER_LOOKS[mode]}
      inline={inline}
      onPress={() => commitParse(edit, writeRecord(edit.draft, edit.modes, field, recordKey, next))}
    />
  );
};

/**
 * A save cell: the value is a field, and the corner marker cycles none → proficient → expertise.
 * The Strength cell also answers an issue on the whole saves record.
 */
export const LiveSaveCell: React.FC<{ ability: AbilityKey }> = ({ ability }) => (
  <>
    <LiveSpecField spec={saveField(ability)} alsoTargets={ability === "str" ? ["saves"] : undefined} />
    <RecordMarker field="saves" recordKey={ability} label={`${ABILITY_FULL_NAMES[ability]} save`} />
  </>
);

/** The Saving Throws line repeats the ability table, where saves are edited. */
export const LiveSavesLine: React.FC = () => {
  const { draft } = useActiveEdit();
  const items = formatRecordEntries(draft.saves ?? undefined);
  return items.length > 0
    ? <span title="Edited in the ability table">{items.join(", ")}</span>
    : <span className={liveStyles.hint}>Set in the ability table</span>;
};

/** "Perception +5, Stealth +4": each value is a field with its mode marker; "+ skill" adds one. */
export const LiveSkills: React.FC = () => {
  const edit = useActiveEdit();
  const keys = Object.keys(edit.draft.skills ?? {}).sort((left, right) => left.localeCompare(right));
  const unused = SKILL_OPTIONS.filter(option => !keys.includes(option.value));
  const add = unused.length > 0 && (
    <LiveSelect
      id="skills"
      label="Add a skill"
      value=""
      prompt="+ Add"
      options={unused}
      onChange={key => {
        const problem = commitParse(edit, writeRecord(edit.draft, edit.modes, "skills", key, "proficient"));
        if (!problem) edit.requestLiveFocus(`skills.${key}`);
        return problem;
      }}
    />
  );
  return (
    <>
      {keys.map((key, index) => (
        <span key={key} className={liveStyles.entry}>
          {`${skillLabel(key)} `}
          <LiveSpecField spec={skillField(key)} keepWhenBlank />
          <RecordMarker field="skills" recordKey={key} label={`${skillLabel(key)} skill`} inline />
          <RemoveLiveEntry
            label={`Remove ${skillLabel(key)} skill`}
            onRemove={() => commitParse(edit, writeRecord(edit.draft, edit.modes, "skills", key, "none"))}
            focusId={keys[index + 1] ? `skills.${keys[index + 1]}` : "skills"}
          />
        </span>
      ))}
      {add}
    </>
  );
};

export const LiveDefense: React.FC<{ field: DefenseField }> = ({ field }) => <LiveTokenList spec={defenseTokens(field)} />;

/** "darkvision 60 ft., passive Perception 13": blank or the computed value is automatic. */
export const LiveSenses: React.FC = () => (
  <LiveTokenList
    spec={SENSES}
    after={<>passive Perception <LiveSpecField spec={PASSIVE_PERCEPTION_FIELD} /></>}
  />
);

export const LiveLanguages: React.FC = () => <LiveTokenList spec={LANGUAGES} />;
