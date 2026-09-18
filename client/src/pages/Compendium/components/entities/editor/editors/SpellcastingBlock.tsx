import React, { useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import type { EntitySpellcasting, SpellEntry, SpellFrequencyGroup, SpellcastingLevel } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  formatSignedNumber,
  formatSpellFrequencyGroup,
  formatSpellLevelLabel,
  titleCase,
  type AbilityKey,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import cardStyles from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.module.css";
import { EditTarget } from "../../../sheetEditor/EditTarget.js";
import { commitParse } from "../../../sheetEditor/fieldSpec.js";
import { Field, PopoverForm } from "../../../sheetEditor/PopoverForm.js";
import { useEditorState } from "../../../sheetEditor/SheetEditContext.js";
import { SpellSearch } from "../../../sheetEditor/SpellSearch.js";
import { LiveInput, useLiveTarget } from "../../../sheetEditor/live/LiveField.js";
import { LiveSourceText } from "../../../sheetEditor/live/LiveSourceText.js";
import liveStyles from "../../../sheetEditor/live/LiveFields.module.css";
import editStyles from "../../../sheetEditor/SheetEditor.module.css";
import { useActiveEdit, useLiveRegion } from "../EntityEditContext.js";
import { entryFieldSpec } from "../model/fields.js";
import { getAutoSpellcastingValues } from "../model/inference.js";
import { SPELL_GROUP_KIND_OPTIONS, SPELLCASTING_ABILITY_OPTIONS } from "../model/options.js";
import {
  addList,
  addSpell,
  AUTO_TEXT,
  findBlock,
  isCounted,
  listForm,
  removeList,
  removeSpell,
  spellcastingFields,
  takesEach,
  writeList,
  type GroupKind,
  type ListAt,
  type ListForm,
} from "../model/spellcastingFields.js";
import { EntryGrip, useEntryDrag, type EntryActions } from "./EntryGrip.js";
import { EntryNameEditor } from "./InlineEditors.js";
import styles from "./EntryCards.module.css";

/** Spellcasting blocks are dragged by their key, like text entries, but only drop on other blocks. */
const BLOCK_DRAG_TYPE = "sheet-spellcasting-entry";

type Fields = ReturnType<typeof spellcastingFields>;
const endsSentence = (name: string) => /[.!?]$/.test(name.trim());

type SpellcastingBlockProps = {
  rowKey: number;
  /** The block's validator path (`spellcasting.0`). */
  id: string;
  block: EntitySpellcasting;
  /** Names the block in its fields' labels: "Innate Spellcasting, Actions". */
  place: string;
  menuLabel: string;
  actions: EntryActions;
  onDropped: (sourceKey: number) => void;
  announce: (message: string) => void;
};

/**
 * A spellcasting block in edit mode, laid out as view mode draws it and edited in place: the bold
 * run-in name, its text (one source field per paragraph; a blank line starts a new one), the
 * ability, save DC and spell attack line, and one line per spell list. A list's label opens its
 * kind and numbers; each spell has a remove button, each line a "+" spell search and a delete
 * button, and "+ Spell list" adds a line. Where the block is shown, moves, hiding the list and
 * deletion are in its ⠿ grip, as for a trait.
 */
export const SpellcastingBlock: React.FC<SpellcastingBlockProps> = ({ rowKey, id, block, place, menuLabel, actions, onDropped, announce }) => {
  const edit = useActiveEdit();
  const liveAt = useLiveRegion();
  const fields = spellcastingFields({ key: rowKey, id, place });
  const bufferKey = (field: string) => `spellcasting[${rowKey}].${field}`;
  const { rowRef, rowProps, arm } = useEntryDrag({ type: BLOCK_DRAG_TYPE, rowKey, name: block.name, onDropped });
  const nameLive = liveAt(fields.name.id) || edit.buffer?.restoreLive(bufferKey("name")) !== undefined;
  const addListRef = useRef<HTMLButtonElement>(null);
  useLiveTarget([`${id}.addList`], addListRef);

  const name = block.name.trim();
  const paragraphs = Math.max(1, block.descriptions.length);
  const levels = (block.levels ?? [])
    .map((list, index) => ({ list: list as SpellcastingLevel | SpellFrequencyGroup, at: { list: "levels", index } as ListAt }))
    .sort((left, right) => (left.list as SpellcastingLevel).level - (right.list as SpellcastingLevel).level);
  const groups = (block.frequencyGroups ?? []).map((list, index) => ({ list: list as SpellcastingLevel | SpellFrequencyGroup, at: { list: "frequencyGroups", index } as ListAt }));
  const lists = [...levels, ...groups];

  const startList = () => {
    if (!edit.claim()) return;
    const { parse, at } = addList(edit.draft, edit.modes, rowKey);
    const problem = commitParse(edit, parse);
    if (problem) {
      announce(problem);
      return;
    }
    // The new line's label opens, so its kind and numbers are chosen at once.
    if (at) edit.open(`${id}.${at.list}.${at.index}`);
  };

  return (
    <div {...rowProps} className={`${styles.entryRow} ${styles.blockRow} ${rowProps.className}`}>
      <div className={cardStyles.entryBlock}>
        <div className={`${cardStyles.entry} ${styles.entryHead} ${styles.blockHead}`}>
          <strong className={`${cardStyles.entryName} ${styles.entryName}`}>
            {nameLive ? (
              <LiveInput
                id={fields.name.id}
                bufferKey={bufferKey("name")}
                label={fields.name.label}
                read={fields.name.read}
                parse={fields.name.parse}
                placeholder="Name"
              />
            ) : (
              <EditTarget id={fields.name.id} kind="inline" label={fields.name.label} editor={<EntryNameEditor spec={entryFieldSpec(fields.name)} />}>
                {name || <span className={styles.unnamed}>Name</span>}
              </EditTarget>
            )}
            {name && !endsSentence(name) && "."}
          </strong>{" "}
          <LiveSourceText
            id={fields.description(0).id}
            bufferKey={bufferKey("descriptions.0")}
            label={fields.description(0).label}
            read={fields.description(0).read}
            parse={fields.description(0).parse}
            placeholder="Text. Type { to link a spell or item; a blank line starts a paragraph."
            inline
            className={cardStyles.entryText}
          />
        </div>
        {Array.from({ length: paragraphs - 1 }, (_, offset) => {
          const field = fields.description(offset + 1);
          return (
            <LiveSourceText
              key={field.id}
              id={field.id}
              bufferKey={bufferKey(`descriptions.${offset + 1}`)}
              label={field.label}
              read={field.read}
              parse={field.parse}
              className={`${cardStyles.entryText} ${styles.paragraphField}`}
            />
          );
        })}
        <SpellcastingMeta id={id} block={block} fields={fields} bufferKey={bufferKey} live={liveAt(`${id}.meta`)} place={place} />
        <div className={`${cardStyles.spellList} ${styles.blockLists}`} data-hidden={block.hideSpellList || undefined}>
          {block.hideSpellList && <p className={styles.hint}>Hidden on the sheet: the text names the spells.</p>}
          {lists.map(({ list, at }) => (
            <SpellListRow key={`${at.list}.${at.index}`} blockKey={rowKey} blockId={id} place={place} at={at} list={list} announce={announce} />
          ))}
          <button ref={addListRef} type="button" className={`${editStyles.placeholder} ${styles.addList}`} onClick={startList}>
            + Spell list
          </button>
        </div>
      </div>
      <EntryGrip id={id} label={menuLabel} actions={actions} rowRef={rowRef} arm={arm} />
    </div>
  );
};

/** "Spellcasting Ability Intelligence; Save DC 14; Spell Attack +6", as view mode prints it. */
const formatMeta = (block: EntitySpellcasting): string => [
  block.ability ? `Spellcasting Ability ${ABILITY_FULL_NAMES[block.ability as AbilityKey] ?? titleCase(block.ability)}` : undefined,
  block.saveDc !== undefined ? `Save DC ${block.saveDc}` : undefined,
  block.spellAttackBonus !== undefined ? `Spell Attack ${formatSignedNumber(block.spellAttackBonus)}` : undefined,
].filter(Boolean).join("; ");

type MetaProps = {
  id: string;
  block: EntitySpellcasting;
  fields: Fields;
  bufferKey: (field: string) => string;
  /** Draws live fields (the live presentation, or unapplied text kept across a switch). */
  live: boolean;
  place: string;
};

/**
 * The ability, save DC and spell attack. Live, each is a field with a list, like a sense or a
 * damage type: the ability's offers the six abilities, and each number's offers the value worked
 * out from the ability and proficiency bonus ("Automatic"); a typed number is kept as typed. On targets the line opens one editor for the three.
 */
const SpellcastingMeta: React.FC<MetaProps> = ({ id, block, fields, bufferKey, live, place }) => {
  const edit = useActiveEdit();
  if (!live) {
    const meta = formatMeta(block);
    const label = `Spellcasting ability, save DC and spell attack of ${place}`;
    return (
      <div className={`${cardStyles.spellcastingMeta} ${styles.metaLine}`}>
        {meta
          ? <EditTarget id={`${id}.meta`} label={label} editor={<MetaEditor fields={fields} />}>{meta}</EditTarget>
          : <EditTarget id={`${id}.meta`} label="Spellcasting ability" placeholder editor={<MetaEditor fields={fields} />} />}
      </div>
    );
  }
  const auto = getAutoSpellcastingValues(edit.draft, block);
  return (
    <div className={`${cardStyles.spellcastingMeta} ${styles.metaLine}`}>
      Spellcasting Ability{" "}
      <LiveInput
        id={fields.ability.id}
        bufferKey={bufferKey("ability")}
        label={fields.ability.label}
        read={fields.ability.read}
        parse={fields.ability.parse}
        placeholder="—"
        suggestions={fields.ability.suggestions}
      />
      ; Save DC{" "}
      <AutoNumber field={fields.saveDc} bufferKey={bufferKey("saveDc")} autoText={auto.saveDc === undefined ? undefined : String(auto.saveDc)} />
      ; Spell Attack{" "}
      <AutoNumber
        field={fields.spellAttackBonus}
        bufferKey={bufferKey("spellAttackBonus")}
        autoText={auto.spellAttackBonus === undefined ? undefined : formatSignedNumber(auto.spellAttackBonus)}
      />
    </div>
  );
};

/** A save DC or spell attack: its list offers "Automatic", and an automatic value says so. */
const AutoNumber: React.FC<{ field: Fields["saveDc"]; bufferKey: string; autoText?: string }> = ({ field, bufferKey, autoText }) => {
  const edit = useActiveEdit();
  const auto = field.auto(edit.draft, edit.modes);
  const suggestion = { value: AUTO_TEXT, label: autoText === undefined ? "Automatic (choose an ability)" : `Automatic (${autoText})` };
  return (
    <>
      <LiveInput
        id={field.id}
        bufferKey={bufferKey}
        label={auto ? `${field.label}, automatic` : field.label}
        read={field.read}
        parse={(text, draft, modes) => (text.trim().toLowerCase() === AUTO_TEXT && field.auto(draft, modes) ? { ok: true, patch: {} } : field.parse(text, draft, modes))}
        placeholder="—"
        inputMode="numeric"
        suggestions={[suggestion]}
      />
      {auto && <span className={styles.autoTag} aria-hidden="true">auto</span>}
    </>
  );
};

/** The targets presentation's editor for the ability, save DC and spell attack. */
const MetaEditor: React.FC<{ fields: Fields }> = ({ fields }) => {
  const edit = useActiveEdit();
  const { draft, modes } = edit;
  const [ability, setAbility] = useEditorState("meta.ability", fields.ability.key(draft, modes));
  const [dcAuto, setDcAuto] = useEditorState("meta.dcAuto", fields.saveDc.auto(draft, modes));
  const [dc, setDc] = useEditorState("meta.dc", fields.saveDc.read(draft, modes));
  const [attackAuto, setAttackAuto] = useEditorState("meta.attackAuto", fields.spellAttackBonus.auto(draft, modes));
  const [attack, setAttack] = useEditorState("meta.attack", fields.spellAttackBonus.read(draft, modes));
  const [error, setError] = useEditorState<string | null>("meta.error", null);
  const auto = getAutoSpellcastingValues(draft, { ability: ability || undefined });

  const apply = (): boolean => {
    // Each changed value is parsed against the draft with the ones before it applied.
    const steps = [
      { parse: fields.ability.parse, text: ability, changed: ability !== fields.ability.key(draft, modes) },
      { parse: fields.saveDc.parse, text: dcAuto ? AUTO_TEXT : dc, changed: dcAuto !== fields.saveDc.auto(draft, modes) || (!dcAuto && dc !== fields.saveDc.read(draft, modes)) },
      {
        parse: fields.spellAttackBonus.parse,
        text: attackAuto ? AUTO_TEXT : attack,
        changed: attackAuto !== fields.spellAttackBonus.auto(draft, modes) || (!attackAuto && attack !== fields.spellAttackBonus.read(draft, modes)),
      },
    ];
    let nextDraft = draft;
    let nextModes = modes;
    let changed = false;
    for (const step of steps) {
      if (!step.changed) continue;
      const result = step.parse(step.text, nextDraft, nextModes);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      nextDraft = { ...nextDraft, ...result.patch };
      nextModes = { ...nextModes, ...result.modes };
      changed = true;
    }
    if (!changed) return true;
    const problem = edit.commit({ spellcasting: nextDraft.spellcasting }, { spellcasting: nextModes.spellcasting });
    setError(problem ?? null);
    return !problem;
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Spellcasting ability">
        {fieldId => (
          <select id={fieldId} data-sheet-field-id={fields.ability.id} value={ability} onChange={event => { setAbility(event.target.value); setError(null); }}>
            {SPELLCASTING_ABILITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </Field>
      <AutoOrTyped
        label="Save DC"
        fieldId={fields.saveDc.id}
        auto={dcAuto}
        onAuto={value => { setDcAuto(value); setError(null); }}
        value={dcAuto ? (auto.saveDc === undefined ? "" : String(auto.saveDc)) : dc}
        onChange={value => { setDc(value); setError(null); }}
      />
      <AutoOrTyped
        label="Spell attack"
        fieldId={fields.spellAttackBonus.id}
        auto={attackAuto}
        onAuto={value => { setAttackAuto(value); setError(null); }}
        value={attackAuto ? (auto.spellAttackBonus === undefined ? "" : formatSignedNumber(auto.spellAttackBonus)) : attack}
        onChange={value => { setAttack(value); setError(null); }}
      />
    </PopoverForm>
  );
};

const AutoOrTyped: React.FC<{
  label: string;
  fieldId: string;
  auto: boolean;
  onAuto: (auto: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, fieldId, auto, onAuto, value, onChange }) => (
  <fieldset className={styles.fieldset}>
    <legend>{label}</legend>
    <label className={styles.check}>
      <input type="checkbox" checked={auto} onChange={event => onAuto(event.target.checked)} /> Automatic
    </label>
    <input aria-label={label} data-sheet-field-id={fieldId} inputMode="numeric" placeholder="—" value={value} disabled={auto} onChange={event => onChange(event.target.value)} />
  </fieldset>
);

// Spell lists -------------------------------------------------------------------------------------

/**
 * How a spell's remove button names it: the name, with the source when another spell in the list
 * has the same name, and its place among identical ones as a last resort.
 */
const spellName = (spells: readonly SpellEntry[], index: number): string => {
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

type SpellListRowProps = {
  blockKey: number;
  blockId: string;
  place: string;
  at: ListAt;
  list: SpellcastingLevel | SpellFrequencyGroup;
  announce: (message: string) => void;
};

/**
 * One spell list as view mode prints it ("1st level (4 slots): Shield, Magic Missile"), then
 * "+" (a spell search). The label opens the list's kind and numbers; the delete button sits in the margin
 * left of the line, shown on hover or focus.
 */
const SpellListRow: React.FC<SpellListRowProps> = ({ blockKey, blockId, place, at, list, announce }) => {
  const edit = useActiveEdit();
  const listId = `${blockId}.${at.list}.${at.index}`;
  const label = at.list === "levels" ? formatSpellLevelLabel(list as SpellcastingLevel) : formatSpellFrequencyGroup(list as SpellFrequencyGroup);
  const where = `the ${label} list of ${place}`;
  const [error, setError] = useState<string | null>(null);

  const deleteList = () => {
    if (!edit.claim()) return;
    const problem = commitParse(edit, removeList(edit.draft, edit.modes, blockKey, at));
    setError(problem ?? null);
    if (problem) return;
    announce(`Deleted ${where}. Undo restores it.`);
    edit.requestLiveFocus(`${blockId}.addList`);
  };

  return (
    <div className={`${cardStyles.spellListLine} ${styles.listLine}`}>
      <span className={cardStyles.spellListLabel}>
        <EditTarget id={listId} label={`Spell list ${label}, ${place}`} editor={<SpellListEditor blockKey={blockKey} listId={listId} at={at} />}>
          {label}:
        </EditTarget>
      </span>{" "}
      {list.spells.map((spell, index) => (
        <React.Fragment key={`${index}-${spell.name}-${spell.source ?? ""}`}>
          {index > 0 && ", "}
          <SpellChip
            spell={spell}
            targetId={`${listId}.spells.${index}`}
            label={`Remove ${spellName(list.spells, index)} from ${where}`}
            onRemove={() => {
              const problem = commitParse(edit, removeSpell(edit.draft, edit.modes, blockKey, at, index));
              if (problem) return problem;
              // The next spell takes this one's place, or the "+" search when it was the last.
              edit.requestLiveFocus(index < list.spells.length - 1 ? `${listId}.spells.${index}` : `${listId}.add`);
              return undefined;
            }}
          />
        </React.Fragment>
      ))}
      <AddSpell
        id={`${listId}.add`}
        label={`Add a spell to ${where}`}
        onPick={spell => commitParse(edit, addSpell(edit.draft, edit.modes, blockKey, at, spell))}
      />
      <span className={styles.lineTools}>
        <button
          type="button"
          className={styles.lineRemove}
          aria-label={`Delete ${where}`}
          title="Delete this spell list"
          onClick={deleteList}
        >
          <FiX aria-hidden="true" />
        </button>
      </span>
      {error && <span role="alert" className={liveStyles.error}>{error}</span>}
    </div>
  );
};

/** A spell's name, with a remove button over its corner while the spell is hovered or focused. */
const SpellChip: React.FC<{ spell: SpellEntry; targetId: string; label: string; onRemove: () => string | undefined }> = ({ spell, targetId, label, onRemove }) => {
  const edit = useActiveEdit();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string>();
  // An issue on this spell (its name or source) focuses its button.
  useLiveTarget([targetId], buttonRef);
  return (
    <span className={styles.spell}>
      <span className={cardStyles.spellListSpells}>{spell.name}</span>
      {spell.note && <span className={cardStyles.spellNote}> ({spell.note})</span>}
      <button
        ref={buttonRef}
        type="button"
        className={styles.spellRemove}
        aria-label={label}
        title={label}
        onClick={() => {
          if (edit.claim()) setError(onRemove());
        }}
      >
        <FiX aria-hidden="true" />
      </button>
      {error && <span role="alert" className={liveStyles.error}>{error}</span>}
    </span>
  );
};

/**
 * "+" at the end of a line: a search of the spell index drawn as a sheet value, as wide as its text. A pick adds
 * the spell with its source; Enter on a name the index does not know adds it as typed. Focus stays
 * for the next spell.
 */
const AddSpell: React.FC<{ id: string; label: string; onPick: (spell: SpellEntry) => string | undefined }> = ({ id, label, onPick }) => {
  const edit = useActiveEdit();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useLiveTarget([id], inputRef);
  return (
    <span
      className={`${liveStyles.live} ${liveStyles.add} ${styles.addSpell}`}
      data-invalid={error !== null || undefined}
      title="Add a spell"
      onFocus={() => void edit.claim()}
    >
      <span className={liveStyles.mirror} aria-hidden="true">{query || "+"}</span>
      <SpellSearch
        label={label}
        query={query}
        onQueryChange={value => {
          setQuery(value);
          // A pick empties the search; only typing clears a refused pick's message.
          if (value !== "") setError(null);
        }}
        allowUnknown
        inline
        inputRef={inputRef}
        inputClassName={liveStyles.input}
        rootClassName={styles.contents}
        placeholder="+"
        onPick={spell => {
          if (!edit.claim()) return;
          setError(onPick(spell) ?? null);
        }}
        onEscape={() => {
          setQuery("");
          setError(null);
        }}
      />
      {error && <span role="alert" className={liveStyles.error}>{error}</span>}
    </span>
  );
};

const LEVEL_OPTIONS = Array.from({ length: 10 }, (_, level) => ({
  value: String(level),
  label: level === 0 ? "Cantrips" : formatSpellLevelLabel({ level, spells: [] }),
}));

/** A spell list's kind and numbers: a slot level with its slots, or how often its spells are cast. */
const SpellListEditor: React.FC<{ blockKey: number; listId: string; at: ListAt }> = ({ blockKey, listId, at }) => {
  const edit = useActiveEdit();
  const found = findBlock(edit.draft, edit.modes, blockKey);
  const [initial] = useState<ListForm>(() => (found ? listForm(found.block, at) : { kind: "will", level: "", slots: "", lowerLevel: "", count: "", each: false }));
  const [form, setForm] = useEditorState<ListForm>("spellList.form", initial);
  const [error, setError] = useEditorState<string | null>("spellList.error", null);
  const update = (patch: Partial<ListForm>) => {
    setForm(current => ({ ...current, ...patch }));
    setError(null);
  };

  const apply = (): boolean => {
    if (JSON.stringify(form) === JSON.stringify(initial)) return true;
    const problem = commitParse(edit, writeList(edit.draft, edit.modes, blockKey, at, form));
    setError(problem ?? null);
    return !problem;
  };

  const freeLevel = () => {
    const used = new Set((found?.block.levels ?? []).map(level => String(level.level)));
    return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].find(level => !used.has(level)) ?? "1";
  };

  return (
    <PopoverForm onApply={apply} error={error}>
      <Field label="Spell list">
        {fieldId => (
          <select
            id={fieldId}
            data-sheet-field-id={`${listId}.frequency`}
            value={form.kind}
            onChange={event => {
              const kind = event.target.value as GroupKind;
              update({ kind, ...(kind === "level" && !form.level ? { level: freeLevel() } : {}) });
            }}
          >
            {SPELL_GROUP_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
      </Field>
      {form.kind === "level" && (
        <div className={styles.row}>
          <Field label="Level">
            {fieldId => (
              <select id={fieldId} data-sheet-field-id={`${listId}.level`} value={form.level} onChange={event => update({ level: event.target.value })}>
                {LEVEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Slots">
            {fieldId => <input id={fieldId} data-sheet-field-id={`${listId}.slots`} inputMode="numeric" placeholder="—" value={form.slots} onChange={event => update({ slots: event.target.value })} />}
          </Field>
          <Field label="Pact magic from level">
            {fieldId => (
              <input id={fieldId} data-sheet-field-id={`${listId}.lowerLevel`} inputMode="numeric" placeholder="—" value={form.lowerLevel} onChange={event => update({ lowerLevel: event.target.value })} />
            )}
          </Field>
        </div>
      )}
      {isCounted(form.kind) && (
        <div className={styles.row}>
          <Field label={form.kind === "recharge" ? "Recharge on" : "Uses"}>
            {fieldId => <input id={fieldId} data-sheet-field-id={`${listId}.count`} inputMode="numeric" value={form.count} onChange={event => update({ count: event.target.value })} />}
          </Field>
          {takesEach(form.kind) && (
            <label className={styles.check}>
              <input type="checkbox" data-sheet-field-id={`${listId}.each`} checked={form.each} onChange={event => update({ each: event.target.checked })} /> Each spell
            </label>
          )}
        </div>
      )}
    </PopoverForm>
  );
};
