import React, { useId } from "react";
import { EditTarget } from "../../sheetEditor/EditTarget.js";
import { commitParse, specParse } from "../../sheetEditor/fieldSpec.js";
import { InlineField } from "../../sheetEditor/InlineField.js";
import { SuggestionList } from "../../sheetEditor/PopoverForm.js";
import { SpecsEditor } from "../../sheetEditor/SpecsEditor.js";
import { LiveSpecField, LiveToggle, LiveTokenList } from "../../sheetEditor/live/LiveField.js";
import { LiveSourceText } from "../../sheetEditor/live/LiveSourceText.js";
import { useActiveSpellEdit, useSpellLiveRegion } from "./SpellEditContext.js";
import {
  ATTACK_FIELD,
  CASTING_TIME_FIELD,
  COMPONENT_FIELDS,
  COMPONENT_LETTERS,
  DESCRIPTION_FIELD,
  DURATION_FIELD,
  HIGHER_LEVELS_FIELD,
  LEVEL_FIELD,
  MATERIAL_CONSUMED_FIELD,
  MATERIAL_COST_FIELD,
  MATERIAL_FIELD,
  NAME_FIELD,
  PAGE_FIELD,
  RANGE_FIELD,
  RITUAL_FIELD,
  SCHOOL_FIELD,
  SOURCE_FIELD,
  SPELL_TAG_LISTS,
  TRIGGER_FIELD,
  type SpellField,
  type SpellTokens,
} from "./model/fields.js";
import { deriveCastingUnit } from "./model/spellDraft.js";
import styles from "../SpellCard.module.css";

// The spell sheet's editable regions. Each draws its specs from `model/fields.ts` as live fields
// (the `live` presentation) or as a target whose popover editor shows them (`targets`).

/** A target's inline editor for one spec. */
const SpecInlineEditor: React.FC<{ spec: SpellField }> = ({ spec }) => {
  const edit = useActiveSpellEdit();
  const listId = useId();
  return (
    <>
      {spec.suggestions && <SuggestionList id={listId} options={spec.suggestions} />}
      <InlineField
        label={spec.label}
        value={spec.read(edit.draft, edit.modes)}
        inputMode={spec.inputMode}
        list={spec.suggestions ? listId : undefined}
        parse={specParse(spec, edit)}
      />
    </>
  );
};

export const SpellNameField: React.FC<{ name: string }> = ({ name }) => {
  const liveAt = useSpellLiveRegion();
  return liveAt("name")
    ? <LiveSpecField spec={NAME_FIELD} />
    : <EditTarget id="name" kind="inline" label={`Name, ${name}`} editor={<SpecInlineEditor spec={NAME_FIELD} />}>{name}</EditTarget>;
};

/** "Level 3 Evocation (ritual)" or "Evocation Cantrip": level, school and the edit-only ritual choice. */
export const SpellHeaderField: React.FC<{ text: string }> = ({ text }) => {
  const { draft } = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  if (!liveAt("header")) {
    return (
      <EditTarget id="header" label={`Level and school, ${text}`} editor={<SpecsEditor specs={[LEVEL_FIELD, SCHOOL_FIELD, RITUAL_FIELD]} />}>
        {text}
      </EditTarget>
    );
  }
  // The words stay where view mode puts them: a cantrip names its school first.
  const level = <LiveSpecField spec={LEVEL_FIELD} />;
  const school = <LiveSpecField spec={SCHOOL_FIELD} />;
  return (
    <>
      {draft.level === "0" ? <>{school} {level}</> : <>{level} {school}</>}
      {" ("}
      <LiveSpecField spec={RITUAL_FIELD} />
      {")"}
    </>
  );
};

/** "XPHB, page 239": source and page. The flag after them is not editable. */
export const SpellSourceField: React.FC<{ text: string }> = ({ text }) => {
  const { draft } = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  if (!liveAt("source")) {
    return <EditTarget id="source" label={`Source, ${text}`} editor={<SpecsEditor specs={[SOURCE_FIELD, PAGE_FIELD]} />}>{text}</EditTarget>;
  }
  return (
    <>
      <LiveSpecField spec={SOURCE_FIELD} />
      {draft.page ? ", page " : " "}
      <LiveSpecField spec={PAGE_FIELD} />
    </>
  );
};

/**
 * "1 reaction, which you take when …": the casting time, and its trigger once the casting time is a
 * reaction or a trigger is stored, as the old form showed it.
 */
export const SpellCastingTimeField: React.FC<{ text: React.ReactNode; label: string }> = ({ text, label }) => {
  const { draft } = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  if (!liveAt("castingTime")) {
    return (
      <EditTarget id="castingTime" label={`Casting Time, ${label}`} editor={<SpecsEditor specs={[CASTING_TIME_FIELD, TRIGGER_FIELD]} />}>
        {text}
      </EditTarget>
    );
  }
  const triggerShown = deriveCastingUnit(draft.castingTime) === "reaction" || draft.castingTrigger !== "";
  return (
    <>
      <LiveSpecField spec={CASTING_TIME_FIELD} alsoTargets={triggerShown ? [] : [TRIGGER_FIELD.id]} />
      {triggerShown && <span className={styles.muted}>{", "}<LiveSpecField spec={TRIGGER_FIELD} /></span>}
    </>
  );
};

/** A stat that is one field: Range or Duration. */
export const SpellStatField: React.FC<{ spec: SpellField; label: string; text: string }> = ({ spec, label, text }) => {
  const liveAt = useSpellLiveRegion();
  return liveAt(spec.id)
    ? <LiveSpecField spec={spec} />
    : <EditTarget id={spec.id} label={`${label}, ${text}`} editor={<SpecsEditor specs={[spec]} />}>{text}</EditTarget>;
};

export const SpellRangeField: React.FC<{ text: string }> = ({ text }) => <SpellStatField spec={RANGE_FIELD} label="Range" text={text} />;
export const SpellDurationField: React.FC<{ text: string }> = ({ text }) => <SpellStatField spec={DURATION_FIELD} label="Duration" text={text} />;

const MATERIAL_FIELDS = [MATERIAL_FIELD, MATERIAL_COST_FIELD, MATERIAL_CONSUMED_FIELD];

/**
 * "V, S, M (a pearl)": each letter turns its component on or off. With M on, the material follows in
 * parentheses, and its cost and whether it is consumed beside it (edit mode only).
 */
export const SpellComponentsField: React.FC<{ text: string }> = ({ text }) => {
  const edit = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  const { draft } = edit;
  if (!liveAt("components")) {
    return (
      <EditTarget id="components" label={`Components, ${text || "none"}`} editor={<SpecsEditor specs={[...COMPONENT_FIELDS, ...MATERIAL_FIELDS]} />}>
        {text}
      </EditTarget>
    );
  }
  return (
    <>
      {COMPONENT_FIELDS.map((spec, index) => (
        <React.Fragment key={spec.id}>
          {index > 0 && ", "}
          <LiveToggle
            id={spec.id}
            // With M off its material fields are hidden; an issue on them reaches the M.
            alsoTargets={spec.id === "m" && !draft.m ? MATERIAL_FIELDS.map(field => field.id) : []}
            label={spec.label}
            text={COMPONENT_LETTERS[spec.id]}
            pressed={spec.read(draft, edit.modes) === "yes"}
            onToggle={pressed => commitParse(edit, spec.parse(pressed ? "yes" : "no", edit.draft, edit.modes))}
          />
        </React.Fragment>
      ))}
      {draft.m && (
        <>
          {" ("}
          <LiveSpecField spec={MATERIAL_FIELD} />
          {") "}
          <LiveSpecField spec={MATERIAL_COST_FIELD} />
          {" gp, "}
          <LiveSpecField spec={MATERIAL_CONSUMED_FIELD} />
        </>
      )}
    </>
  );
};

/** The description as the sheet shows it; a click opens its source in place, with the `{` reference menu. */
export const SpellDescriptionField: React.FC = () => (
  <LiveSourceText
    id={DESCRIPTION_FIELD.id}
    label={DESCRIPTION_FIELD.label}
    read={DESCRIPTION_FIELD.read}
    parse={DESCRIPTION_FIELD.parse}
    placeholder="Description. Type { to link a spell or item."
    className={styles.description}
  />
);

/** The higher-levels text under its heading, which follows the level as in view mode. */
export const SpellHigherLevelsField: React.FC<{ heading: string }> = ({ heading }) => (
  <section className={styles.higherLevels} aria-label={heading}>
    <h4>{heading}</h4>
    <LiveSourceText
      id={HIGHER_LEVELS_FIELD.id}
      label={heading}
      read={HIGHER_LEVELS_FIELD.read}
      parse={HIGHER_LEVELS_FIELD.parse}
      placeholder="Optional."
    />
  </section>
);

const TagListValue: React.FC<{ spec: SpellTokens }> = ({ spec }) => {
  const { draft } = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  if (liveAt(spec.id)) return <LiveTokenList spec={spec} addLabel={`+ ${spec.noun}`} />;
  const tokens = spec.read(draft);
  const editor = <SpecsEditor specs={[]} tokens={[spec]} />;
  return tokens.length > 0
    ? <EditTarget id={spec.id} label={`${spec.label}, ${tokens.join(", ")}`} editor={editor}>{tokens.join(", ")}</EditTarget>
    : <EditTarget id={spec.id} label={spec.label} placeholder editor={editor} />;
};

/**
 * The tags under the text, a line each while editing: classes, damage types, saves, conditions and
 * the edit-only aliases and spell attack, which the sheet does not show otherwise.
 */
export const SpellTagRows: React.FC = () => {
  const edit = useActiveSpellEdit();
  const liveAt = useSpellLiveRegion();
  const attack = ATTACK_FIELD.options?.find(option => option.value === edit.draft.attack)?.label ?? edit.draft.attack;
  return (
    <dl className={styles.tagRows}>
      {SPELL_TAG_LISTS.map(spec => (
        <div key={spec.id}>
          <dt>{spec.label}</dt>
          <dd><TagListValue spec={spec} /></dd>
        </div>
      ))}
      <div>
        <dt>Spell attack</dt>
        <dd>
          {liveAt(ATTACK_FIELD.id)
            ? <LiveSpecField spec={ATTACK_FIELD} />
            : <EditTarget id={ATTACK_FIELD.id} label={`Spell attack, ${attack}`} editor={<SpecsEditor specs={[ATTACK_FIELD]} />}>{attack}</EditTarget>}
        </dd>
      </div>
    </dl>
  );
};
