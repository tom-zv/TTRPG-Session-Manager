import React, { useRef } from "react";
import {
  UNCOUNTED_SPELL_FREQUENCIES,
  type EntitySpellcasting,
  type SpellEntry,
  type SpellFrequency,
  type SpellFrequencyGroup,
  type SpellcastingLevel,
} from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { formatSignedNumber } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { useActiveEdit } from "../EntityEditContext.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { getProficiencyBonusForCr, getSpellAttackBonus, getSpellSaveDc } from "../model/calculations.js";
import type { LayoutItem } from "../model/entryLayout.js";
import type { SpellcastingModes } from "../model/inference.js";
import { SPELL_GROUP_KIND_OPTIONS, SPELLCASTING_ABILITY_OPTIONS, SPELLCASTING_DISPLAY_OPTIONS } from "../model/options.js";
import { EntryCardFrame, descriptionTooLong, sameValue, type EntryCardHost } from "../../../sheetEditor/EntryCardFrame.js";
import { Field } from "../../../sheetEditor/PopoverForm.js";
import { SpellSearch } from "./SpellSearch.js";
import { MAX_WHOLE, textProblem } from "./fieldLimits.js";
import { parseWhole } from "../../../sheetEditor/InlineField.js";
import styles from "./EntryCards.module.css";

type SpellcastingItem = Extract<LayoutItem, { kind: "spellcasting" }>;
type GroupKind = "level" | SpellFrequency;

/** One spell list as the card edits it: numbers as typed, spells as chips. */
type GroupDraft = {
  key: number;
  kind: GroupKind;
  level: string;
  slots: string;
  lowerLevel: string;
  count: string;
  each?: boolean;
  spells: SpellEntry[];
};

const text = (value: number | undefined): string => (value === undefined ? "" : String(value));
const isCounted = (kind: GroupKind): boolean => kind !== "level" && !UNCOUNTED_SPELL_FREQUENCIES.includes(kind);
const takesEach = (kind: GroupKind): boolean => isCounted(kind) && kind !== "recharge" && kind !== "legendary";
// Paragraphs are separated by a blank line; a description is one paragraph of the block.
const splitParagraphs = (value: string): string[] => value.split(/\r?\n\s*\r?\n/).map(part => part.trim()).filter(Boolean);

const toGroups = (spellcasting: EntitySpellcasting): GroupDraft[] => [
  ...(spellcasting.levels ?? []).map((level, index): GroupDraft => ({
    key: index,
    kind: "level",
    level: String(level.level),
    slots: text(level.slots),
    lowerLevel: text(level.lowerLevel),
    count: "",
    spells: level.spells,
  })),
  ...(spellcasting.frequencyGroups ?? []).map((group, index): GroupDraft => ({
    key: 1000 + index,
    kind: group.frequency,
    level: "",
    slots: "",
    lowerLevel: "",
    count: text(group.count),
    each: group.each,
    spells: group.spells,
  })),
];

/**
 * A spellcasting block as a card: name, where it is displayed, ability, save DC and spell attack
 * (each worked out from the ability and proficiency bonus, or typed), its descriptions, and its
 * spell lists. Spells are chosen from the spell index, so each keeps its source.
 */
export const SpellcastingCard: React.FC<{ host: EntryCardHost<LayoutItem>; item: SpellcastingItem }> = ({ host, item }) => {
  const { draft } = useActiveEdit();
  const original = item.value;
  const pb = getProficiencyBonusForCr(draft.cr);
  const computeDc = (ability: string) => getSpellSaveDc(ability || undefined, draft.abilityScores, pb);
  const computeAttack = (ability: string) => getSpellAttackBonus(ability || undefined, draft.abilityScores, pb);
  const initialAbility = original.ability ?? "";

  const [name, setName] = useEditorState("spellcasting.name", original.name);
  const [displayAs, setDisplayAs] = useEditorState<string>("spellcasting.displayAs", original.displayAs ?? "");
  const [ability, setAbility] = useEditorState("spellcasting.ability", initialAbility);
  // The draft keeps whether each value is automatic, so a score change and a reopened card agree.
  const [dcAuto, setDcAuto] = useEditorState("spellcasting.dcAuto", item.modes.saveDc === "auto");
  const [dc, setDc] = useEditorState("spellcasting.dc", text(original.saveDc));
  const [attackAuto, setAttackAuto] = useEditorState("spellcasting.attackAuto", item.modes.spellAttackBonus === "auto");
  const [attack, setAttack] = useEditorState("spellcasting.attack", text(original.spellAttackBonus));
  const initialDescriptions = original.descriptions.join("\n\n");
  const [descriptions, setDescriptions] = useEditorState("spellcasting.descriptions", initialDescriptions);
  const [hideList, setHideList] = useEditorState("spellcasting.hideList", original.hideSpellList ?? false);
  const [groups, setGroups] = useEditorState<GroupDraft[]>("spellcasting.groups", () => toGroups(original));
  // Past any key a group restored after a reader remount already uses.
  const nextKey = useRef(Math.max(2000, ...groups.map(group => group.key + 1)));
  const [error, setError] = useEditorState<string | null>("spellcasting.error", null);

  const autoDc = computeDc(ability);
  const autoAttack = computeAttack(ability);
  const updateGroup = (key: number, patch: Partial<GroupDraft>) => {
    setGroups(current => current.map(group => (group.key === key ? { ...group, ...patch } : group)));
    setError(null);
  };

  const read = () => {
    const fail = (message: string) => {
      setError(message);
      return false as const;
    };
    const empty = !name.trim() && !descriptions.trim() && groups.every(group => group.spells.length === 0);
    if (empty) return { item: null, section: displayAs || "spellcasting" };
    const nameProblem = textProblem(name, ENTITY_LIMITS.entryName, true);
    if (nameProblem) return fail(`Name: ${nameProblem}`);

    const [minAttack, maxAttack] = ENTITY_LIMITS.tinyInt;
    const saveDc = dcAuto ? autoDc : dc.trim() === "" ? undefined : parseWhole(dc, 0, maxAttack);
    if (!dcAuto && dc.trim() !== "" && saveDc === undefined) return fail(`Save DC is a whole number from 0 to ${maxAttack}.`);
    // A worked-out DC is stored in the same column, so it has the same range.
    if (dcAuto && saveDc !== undefined && (saveDc < 0 || saveDc > maxAttack)) {
      return fail(`Save DC: the automatic value would be ${saveDc}, outside 0 to ${maxAttack}. Type a save DC instead.`);
    }
    const attackText = attack.trim().replace(/^\+/, "");
    const spellAttackBonus = attackAuto ? autoAttack : attackText === "" ? undefined : Number(attackText);
    if (spellAttackBonus !== undefined && (!Number.isInteger(spellAttackBonus) || spellAttackBonus < minAttack || spellAttackBonus > maxAttack)) {
      return fail(`Spell attack is a whole number from ${minAttack} to +${maxAttack}.`);
    }

    const paragraphs = descriptions === initialDescriptions ? original.descriptions : splitParagraphs(descriptions);
    for (const paragraph of paragraphs) {
      const problem = textProblem(paragraph);
      if (problem) return fail(`Description: ${problem}`);
      if (descriptionTooLong(paragraph, ENTITY_LIMITS.descriptionBytes)) return fail("Description: a paragraph is too long to save.");
    }

    const levels: SpellcastingLevel[] = [];
    const frequencyGroups: SpellFrequencyGroup[] = [];
    const seenLevels = new Set<number>();
    for (const [index, group] of groups.entries()) {
      const where = `Spell list ${index + 1}`;
      for (const [spellIndex, spell] of group.spells.entries()) {
        const nameProblem = textProblem(spell.name, ENTITY_LIMITS.entryName, true);
        if (nameProblem) return fail(`${where}, spell ${spellIndex + 1}: Name: ${nameProblem}`);
        const sourceProblem = spell.source === undefined ? undefined : textProblem(spell.source, ENTITY_LIMITS.spellSource);
        if (sourceProblem) return fail(`${where}, ${spell.name.trim()}: Source: ${sourceProblem}`);
        const problem = textProblem(spell.note ?? "", ENTITY_LIMITS.spellNote);
        if (problem) return fail(`${where}, note for ${spell.name}: ${problem}`);
      }
      const spells = group.spells.map(spell => {
        const note = spell.note?.trim();
        const rest: SpellEntry = { ...spell };
        delete rest.note;
        return note ? { ...rest, note } : rest;
      });
      if (group.kind === "level") {
        const level = parseWhole(group.level, 0, 9);
        if (level === undefined) return fail(`${where}: the level is a whole number from 0 (cantrips) to 9.`);
        if (seenLevels.has(level)) return fail(`${where}: another list already has level ${level}.`);
        seenLevels.add(level);
        const slots = group.slots.trim() === "" ? undefined : parseWhole(group.slots, 0, MAX_WHOLE);
        if (group.slots.trim() !== "" && slots === undefined) return fail(`${where}: slots are a whole number from 0.`);
        const lowerLevel = group.lowerLevel.trim() === "" ? undefined : parseWhole(group.lowerLevel, 0, level);
        if (group.lowerLevel.trim() !== "" && lowerLevel === undefined) {
          return fail(`${where}: the pact magic lowest level is a whole number from 0 to ${level}.`);
        }
        levels.push({ level, ...(slots !== undefined ? { slots } : {}), ...(lowerLevel !== undefined ? { lowerLevel } : {}), spells });
      } else {
        const count = !isCounted(group.kind) || group.count.trim() === "" ? undefined : parseWhole(group.count, 1, Number.MAX_SAFE_INTEGER);
        if (isCounted(group.kind) && group.count.trim() !== "" && count === undefined) return fail(`${where}: the count is a whole number from 1.`);
        frequencyGroups.push({
          frequency: group.kind,
          ...(count !== undefined ? { count } : {}),
          ...(takesEach(group.kind) && group.each !== undefined ? { each: group.each } : {}),
          spells,
        });
      }
    }

    // Where the block is shown changes through the card's section, as for any entry.
    const value: EntitySpellcasting = {
      ...original,
      name: name === original.name ? name : name.trim(),
      ability: ability || undefined,
      saveDc,
      spellAttackBonus,
      descriptions: paragraphs,
      hideSpellList: hideList ? true : original.hideSpellList === false ? false : undefined,
      // An empty kind of list that was absent stays absent.
      levels: levels.length > 0 || original.levels ? levels : undefined,
      frequencyGroups: frequencyGroups.length > 0 || original.frequencyGroups ? frequencyGroups : undefined,
    };
    const modes: SpellcastingModes = { saveDc: dcAuto ? "auto" : "manual", spellAttackBonus: attackAuto ? "auto" : "manual" };
    const untouched = sameValue(value, original) && sameValue(modes, item.modes);
    return { item: untouched ? item : { ...item, value, modes }, section: displayAs || "spellcasting" };
  };

  return (
    <EntryCardFrame host={host} read={read} error={error} name={name.trim()}>
      <div className={styles.row}>
        <Field label="Name">{id => <input id={id} value={name} placeholder="Spellcasting" onChange={event => { setName(event.target.value); setError(null); }} />}</Field>
        <Field label="Shown in">
          {id => (
            <select id={id} value={displayAs} onChange={event => setDisplayAs(event.target.value)}>
              {SPELLCASTING_DISPLAY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Spellcasting ability">
          {id => (
            <select id={id} value={ability} onChange={event => setAbility(event.target.value)}>
              {SPELLCASTING_ABILITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className={styles.row}>
        <NumberWithAuto
          label="Save DC"
          auto={dcAuto}
          onAuto={setDcAuto}
          value={dcAuto ? text(autoDc) : dc}
          onChange={setDc}
          hint={`8 + ability modifier + PB ${formatSignedNumber(pb)}`}
        />
        <NumberWithAuto
          label="Spell attack"
          auto={attackAuto}
          onAuto={setAttackAuto}
          value={attackAuto ? (autoAttack === undefined ? "" : formatSignedNumber(autoAttack)) : attack}
          onChange={setAttack}
          hint={`ability modifier + PB ${formatSignedNumber(pb)}`}
        />
      </div>
      <Field label="Description">
        {id => (
          <textarea
            id={id}
            rows={4}
            value={descriptions}
            onChange={event => { setDescriptions(event.target.value); setError(null); }}
          />
        )}
      </Field>
      <p className={styles.hint}>Separate paragraphs with a blank line.</p>
      <label className={styles.check}>
        <input type="checkbox" checked={hideList} onChange={event => setHideList(event.target.checked)} />
        Hide the spell list (the description names the spells)
      </label>
      {groups.map((group, index) => (
        <SpellGroupEditor
          key={group.key}
          label={`Spell list ${index + 1}`}
          group={group}
          onChange={patch => updateGroup(group.key, patch)}
          onRemove={() => setGroups(current => current.filter(existing => existing.key !== group.key))}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          const level = groups.some(group => group.kind === "level") ? "will" : "level";
          setGroups(current => [
            ...current,
            { key: nextKey.current++, kind: level, level: level === "level" ? "1" : "", slots: "", lowerLevel: "", count: "", spells: [] },
          ]);
        }}
      >
        + Add spell list
      </button>
    </EntryCardFrame>
  );
};

const NumberWithAuto: React.FC<{
  label: string;
  auto: boolean;
  onAuto: (auto: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}> = ({ label, auto, onAuto, value, onChange, hint }) => (
  <fieldset className={styles.fieldset}>
    <legend>{label}</legend>
    <label className={styles.check}>
      <input type="checkbox" checked={auto} onChange={event => onAuto(event.target.checked)} /> Automatic
    </label>
    <input aria-label={label} inputMode="numeric" value={value} disabled={auto} onChange={event => onChange(event.target.value)} />
    {auto && <span className={styles.hint}>{hint}</span>}
  </fieldset>
);

/**
 * How a chip's controls name its spell: the name, with the source when another chip in the list
 * has the same name, and its place among identical ones as a last resort.
 */
const chipName = (spells: readonly SpellEntry[], index: number): string => {
  const spell = spells[index];
  const key = (name: string) => name.trim().toLowerCase();
  const sameName = spells.filter(other => key(other.name) === key(spell.name));
  if (sameName.length < 2) return spell.name;
  const named = `${spell.name} (${spell.source ?? "no source"})`;
  const identical = spells
    .map((other, at) => ({ other, at }))
    .filter(({ other }) => key(other.name) === key(spell.name) && (other.source ?? "") === (spell.source ?? ""));
  if (identical.length < 2) return named;
  return `${named}, ${identical.findIndex(({ at }) => at === index) + 1} of ${identical.length}`;
};

const SpellGroupEditor: React.FC<{
  label: string;
  group: GroupDraft;
  onChange: (patch: Partial<GroupDraft>) => void;
  onRemove: () => void;
}> = ({ label, group, onChange, onRemove }) => {
  const counted = isCounted(group.kind);
  return (
    <fieldset className={styles.fieldset}>
      <legend>{label}</legend>
      <div className={styles.row}>
        <Field label="List">
          {id => (
            <select
              id={id}
              value={group.kind}
              onChange={event => {
                const kind = event.target.value as GroupKind;
                onChange({ kind, ...(kind === "level" && !group.level.trim() ? { level: "1" } : {}) });
              }}
            >
              {SPELL_GROUP_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
        </Field>
        {group.kind === "level" && (
          <>
            <Field label="Level">{id => <input id={id} inputMode="numeric" value={group.level} onChange={event => onChange({ level: event.target.value })} />}</Field>
            <Field label="Slots">{id => <input id={id} inputMode="numeric" value={group.slots} onChange={event => onChange({ slots: event.target.value })} />}</Field>
            <Field label="Pact magic from level">
              {id => <input id={id} inputMode="numeric" placeholder="—" value={group.lowerLevel} onChange={event => onChange({ lowerLevel: event.target.value })} />}
            </Field>
          </>
        )}
        {counted && (
          <Field label={group.kind === "recharge" ? "Recharge on" : "Uses"}>
            {id => <input id={id} inputMode="numeric" value={group.count} onChange={event => onChange({ count: event.target.value })} />}
          </Field>
        )}
        {takesEach(group.kind) && (
          <label className={styles.check}>
            <input type="checkbox" checked={group.each ?? false} onChange={event => onChange({ each: event.target.checked })} /> Each
          </label>
        )}
        <button type="button" onClick={onRemove}>Remove {label.toLowerCase()}</button>
      </div>
      {group.spells.length > 0 && (
        <ul className={styles.chips} aria-label={`Spells in ${label.toLowerCase()}`}>
          {group.spells.map((spell, index) => (
            <li key={`${index}-${spell.name}`} className={styles.chip}>
              <span>{spell.name}{spell.source ? ` (${spell.source})` : ""}</span>
              <input
                aria-label={`Note for ${chipName(group.spells, index)}`}
                placeholder="note"
                value={spell.note ?? ""}
                onChange={event => onChange({ spells: group.spells.map((existing, at) => (at === index ? { ...existing, note: event.target.value } : existing)) })}
              />
              <button type="button" aria-label={`Remove ${chipName(group.spells, index)}`} onClick={() => onChange({ spells: group.spells.filter((_, at) => at !== index) })}>×</button>
            </li>
          ))}
        </ul>
      )}
      <SpellSearch
        label={`Add a spell to ${label.toLowerCase()}`}
        allowUnknown
        onPick={spell => onChange({ spells: [...group.spells, spell] })}
      />
    </fieldset>
  );
};
