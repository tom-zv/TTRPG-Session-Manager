import React, { useId } from "react";
import { ITEM_LIMITS } from "shared/domain/dnd5e/item.js";
import type { SpellRef } from "shared/domain/dnd5e/spell.js";
import { EditTarget } from "../../sheetEditor/EditTarget.js";
import { useEditorState } from "../../sheetEditor/SheetEditContext.js";
import { commitParse, specParse } from "../../sheetEditor/fieldSpec.js";
import { InlineField } from "../../sheetEditor/InlineField.js";
import { AddChoice, Field, PopoverForm, SuggestionList } from "../../sheetEditor/PopoverForm.js";
import { SpecsEditor } from "../../sheetEditor/SpecsEditor.js";
import { SpellSearch } from "../../sheetEditor/SpellSearch.js";
import { LiveSelect, LiveSpecField, LiveTokenList, RemoveLiveEntry } from "../../sheetEditor/live/LiveField.js";
import { LiveSourceText } from "../../sheetEditor/live/LiveSourceText.js";
import liveStyles from "../../sheetEditor/live/LiveFields.module.css";
import { ItemPicker } from "../ItemPicker.js";
import { KIND_LABELS, formatItemLink } from "../itemFormat.js";
import { useActiveItemEdit, useItemLiveRegion } from "./ItemEditContext.js";
import {
  ALIASES,
  ATTUNEMENT_FIELD,
  ATTUNEMENT_NOTE_FIELD,
  DAMAGE_DICE_FIELD,
  DAMAGE_TYPE_FIELD,
  DESCRIPTION_FIELD,
  ITEM_STATS,
  NAME_FIELD,
  PAGE_FIELD,
  RARITY_FIELD,
  RECHARGE_AMOUNT_FIELD,
  RECHARGE_FIELD,
  SOURCE_FIELD,
  VERSATILE_FIELD,
  WONDROUS_FIELD,
  categoryField,
  spellAddition,
  statByKey,
  type ItemField,
  type ItemStat,
} from "./model/fields.js";
import { itemFieldRegion } from "./model/issueTargets.js";
import styles from "../Items.module.css";

// The item sheet's editable regions. Each draws its specs from `model/fields.ts` as live fields
// (the `live` presentation) or as a target whose popover editor shows them (`targets`).

/** A target's inline editor for one spec. */
const SpecInlineEditor: React.FC<{ spec: ItemField }> = ({ spec }) => {
  const edit = useActiveItemEdit();
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

export const ItemNameField: React.FC<{ name: string }> = ({ name }) => {
  const liveAt = useItemLiveRegion();
  return liveAt("name")
    ? <LiveSpecField spec={NAME_FIELD} />
    : <EditTarget id="name" kind="inline" label={`Name, ${name}`} editor={<SpecInlineEditor spec={NAME_FIELD} />}>{name}</EditTarget>;
};

/** "Wondrous item, rare, wondrous (requires attunement by a wizard)": each part is its own field. */
export const ItemSubtitleField: React.FC<{ text: string }> = ({ text }) => {
  const edit = useActiveItemEdit();
  const liveAt = useItemLiveRegion();
  const { draft, record } = edit;
  const category = categoryField(record.kind);
  const noteShown = draft.requiresAttunement || (ATTUNEMENT_FIELD.read(draft, {}) === "none" && draft.attunementNote.trim() !== "");
  if (!liveAt("subtitle")) {
    return (
      <EditTarget
        id="subtitle"
        label={`Type, ${text}`}
        editor={<SpecsEditor specs={[category, RARITY_FIELD, WONDROUS_FIELD, ATTUNEMENT_FIELD, ATTUNEMENT_NOTE_FIELD]} />}
      >
        {text}
      </EditTarget>
    );
  }
  return (
    <>
      {record.kind !== "concrete" && `${KIND_LABELS[record.kind]}, `}
      <LiveSpecField spec={category} />
      {", "}
      <LiveSpecField spec={RARITY_FIELD} />
      {", "}
      <LiveSpecField spec={WONDROUS_FIELD} />
      {" ("}
      {/* The note shows while attunement is required, or while it holds text that needs it (stored
          before the rule, or rejected by the server), so an issue on it reaches the value. */}
      <LiveSpecField spec={ATTUNEMENT_FIELD} alsoTargets={noteShown ? [] : [ATTUNEMENT_NOTE_FIELD.id]} />
      {noteShown && <>{" "}<LiveSpecField spec={ATTUNEMENT_NOTE_FIELD} /></>}
      {")"}
    </>
  );
};

/** "PHB, page 213": source and page. The flags after them are not editable. */
export const ItemSourceField: React.FC<{ text: string }> = ({ text }) => {
  const { draft } = useActiveItemEdit();
  const liveAt = useItemLiveRegion();
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

/** "Also called …": a token per alias, or a placeholder line while there are none. A block, as its add field and a narrow editor are. */
export const ItemAliasesField: React.FC = () => {
  const { draft } = useActiveItemEdit();
  const liveAt = useItemLiveRegion();
  if (liveAt("aliases")) {
    return <div className={styles.aliases}>Also called <LiveTokenList spec={ALIASES} addLabel="+ alias" /></div>;
  }
  const editor = <SpecsEditor specs={[]} tokens={[ALIASES]} />;
  return draft.aliases.length > 0 ? (
    <div className={styles.aliases}>
      Also called{" "}
      <EditTarget id="aliases" label={`Also called, ${draft.aliases.join(", ")}`} editor={editor}>{draft.aliases.join(", ")}</EditTarget>
    </div>
  ) : (
    <div className={styles.aliases}><EditTarget id="aliases" label="Also called" placeholder editor={editor} /></div>
  );
};

/**
 * The base printing, chosen with the item picker in both presentations. A generated specific's base
 * is its identity: shown, not editable. Only a concrete item names a base.
 */
export const ItemBaseRow: React.FC = () => {
  const edit = useActiveItemEdit();
  const { draft, record } = edit;
  const base = draft.base;
  if (draft.baseLocked) {
    return base && (
      <div>
        <dt>Base item</dt>
        <dd>{formatItemLink(base)} <span className={styles.hint}>(fixed for a generated item)</span></dd>
      </div>
    );
  }
  if (record.kind !== "concrete") {
    return base && (
      <div>
        <dt>Base item</dt>
        <dd>{formatItemLink(base)}</dd>
      </div>
    );
  }
  // The server's rule: a concrete item, not generated from a family, and not this item.
  const picker = edit.viewer && (
    <ItemPicker
      viewer={edit.viewer}
      label="Choose a base item"
      excludeSpecifics
      excludeId={record.id || undefined}
      onPick={item => {
        edit.commit({ base: { id: item.id, name: item.name, source: item.source } });
        edit.close(true);
      }}
      onCancel={() => edit.close(true)}
    />
  );
  return (
    <div>
      <dt className={base ? undefined : styles.visuallyHidden}>Base item</dt>
      <dd>
        <EditTarget id="base" label={base ? `Base item, ${formatItemLink(base)}` : "Base item"} placeholder={!base} editor={picker}>
          {base && formatItemLink(base)}
        </EditTarget>
        {base && <RemoveLiveEntry label="Remove base item" onRemove={() => edit.commit({ base: null })} focusId="base" />}
      </dd>
    </div>
  );
};

/** A stat's value as live fields, in the words the sheet reads ("1d8 slashing (versatile 1d10)"). */
const LiveStatValue: React.FC<{ stat: ItemStat }> = ({ stat }) => {
  const { draft } = useActiveItemEdit();
  const [spec] = stat.specs;
  switch (stat.key) {
    case "valueCp":
      return <><LiveSpecField spec={spec} /> gp</>;
    case "weightLb":
      return <><LiveSpecField spec={spec} /> lb.</>;
    case "damage":
      return (
        <>
          <LiveSpecField spec={DAMAGE_DICE_FIELD} />{" "}
          <LiveSpecField spec={DAMAGE_TYPE_FIELD} />
          {draft.versatileDice ? <>{" (versatile "}<LiveSpecField spec={VERSATILE_FIELD} />{")"}</> : <>{" "}<LiveSpecField spec={VERSATILE_FIELD} /></>}
        </>
      );
    case "weaponCategory":
      return <><LiveSpecField spec={spec} /> weapon</>;
    case "range":
      return <><LiveSpecField spec={spec} /> ft.</>;
    case "strength":
      return <>Str <LiveSpecField spec={spec} /></>;
    case "stealth":
      return <>Disadvantage</>;
    case "recharge":
      return <RechargeValue />;
    default:
      return stat.tokens ? <LiveTokenList spec={stat.tokens} /> : <LiveSpecField spec={spec} />;
  }
};

/** "1d6 + 4 at dawn": an amount and when. A recharge with no time yet offers one. */
const RechargeValue: React.FC = () => {
  const edit = useActiveItemEdit();
  const { draft } = edit;
  return (
    <>
      <LiveSpecField spec={RECHARGE_AMOUNT_FIELD} />{" "}
      <LiveSelect
        id={RECHARGE_FIELD.id}
        label={RECHARGE_FIELD.label}
        value={draft.recharge}
        // With no time yet the closed menu reads "+ when", and the blank choice is that prompt.
        options={(RECHARGE_FIELD.options ?? []).filter(option => draft.recharge || option.value !== "")}
        prompt={draft.recharge ? undefined : "+ when"}
        onChange={text => commitParse(edit, RECHARGE_FIELD.parse(text, edit.draft, edit.modes))}
      />
    </>
  );
};

/** A stat's popover: its fields, then Remove. */
const StatEditor: React.FC<{ stat: ItemStat }> = ({ stat }) => {
  const edit = useActiveItemEdit();
  return (
    <SpecsEditor specs={stat.specs} tokens={stat.tokens ? [stat.tokens] : []}>
      <button
        type="button"
        onClick={() => {
          edit.commit(stat.clear(edit.draft));
          edit.hideStat(stat.key);
          edit.closeTo("stats");
        }}
      >
        Remove {stat.label.toLowerCase()}
      </button>
    </SpecsEditor>
  );
};

/** Picks an absent stat in the targets presentation, then opens its editor. */
const AddStatEditor: React.FC<{ options: readonly ItemStat[] }> = ({ options }) => {
  const edit = useActiveItemEdit();
  return (
    <PopoverForm onApply={() => true}>
      <AddChoice
        label="stat"
        options={options.map(stat => ({ value: stat.key, label: stat.label }))}
        onPick={key => {
          const stat = statByKey(key);
          if (!stat) return;
          if (stat.add) {
            edit.commit(stat.add);
            edit.closeTo("stats");
            return;
          }
          edit.showStat(key);
          edit.switchTo(key);
        }}
      />
    </PopoverForm>
  );
};

type StatLine = { key: string; text: string };

/**
 * The stats list in edit mode: each present stat (or one just added) is a line of fields with its
 * Remove; "+ stat" at the end offers every absent stat.
 */
export const ItemStatsField: React.FC<{ lines: readonly StatLine[] }> = ({ lines }) => {
  const edit = useActiveItemEdit();
  const liveAt = useItemLiveRegion();
  const { draft, addedStats, pendingLive, activeId } = edit;
  // A line stays while it holds input the draft has not seen: unapplied live text, or its open
  // editor. Both outlive a remount (a breakpoint, Resume) in the slot's buffer; `addedStats` does not.
  const pendingRegions = new Set(pendingLive.map(itemFieldRegion));
  if (activeId !== null) pendingRegions.add(itemFieldRegion(activeId));
  const shown = ITEM_STATS.filter(stat => stat.present(draft) || addedStats.includes(stat.key) || pendingRegions.has(stat.key));
  const absent = ITEM_STATS.filter(stat => !shown.includes(stat));
  const live = liveAt("stats");
  const remove = (stat: ItemStat) => {
    const problem = edit.commit(stat.clear(edit.draft));
    if (!problem) edit.hideStat(stat.key);
    return problem;
  };
  const add = (key: string) => {
    const stat = statByKey(key);
    if (!stat) return undefined;
    if (stat.add) return edit.commit(stat.add);
    edit.showStat(key);
    edit.requestLiveFocus(stat.tokens?.id ?? stat.specs[0]?.id ?? "stats");
    return undefined;
  };
  return (
    <dl className={`${styles.stats} ${styles.statsEditing}`}>
      {shown.map(stat => {
        const text = lines.find(line => line.key === stat.key)?.text ?? "";
        const present = stat.present(draft);
        return (
          <div key={stat.key}>
            <dt>{stat.label}</dt>
            <dd>
              {liveAt(stat.key) ? (
                <>
                  <LiveStatValue stat={stat} />
                  {/* A token list's tokens have their own Remove; an empty line added from "+ stat" has the line's. */}
                  {(!stat.tokens || !present) && <RemoveLiveEntry label={`Remove ${stat.label.toLowerCase()}`} onRemove={() => remove(stat)} focusId="stats" />}
                </>
              ) : (
                <EditTarget id={stat.key} label={present ? `${stat.label}, ${text}` : stat.label} placeholder={!present} editor={<StatEditor stat={stat} />}>
                  {text}
                </EditTarget>
              )}
            </dd>
          </div>
        );
      })}
      {absent.length > 0 && (
        <div>
          <dt className={styles.visuallyHidden}>More stats</dt>
          <dd>
            {live ? (
              <LiveSelect
                id="stats"
                label="Add a stat"
                value=""
                prompt="+ stat"
                options={absent.map(stat => ({ value: stat.key, label: stat.label }))}
                onChange={add}
              />
            ) : (
              <EditTarget id="stats" label="stat" placeholder editor={<AddStatEditor options={absent} />} />
            )}
          </dd>
        </div>
      )}
    </dl>
  );
};

/** The description's source, in place, with the `{` reference menu (both presentations). */
export const ItemDescriptionField: React.FC = () => (
  <LiveSourceText
    id={DESCRIPTION_FIELD.id}
    label={DESCRIPTION_FIELD.label}
    read={DESCRIPTION_FIELD.read}
    parse={DESCRIPTION_FIELD.parse}
    placeholder="Description. Type { to link a spell or item."
  />
);

const spellLabel = (spell: SpellRef) => (spell.source ? `${spell.name} (${spell.source})` : spell.name);
const sameSpell = (left: SpellRef, right: SpellRef) =>
  left.name.toLowerCase() === right.name.toLowerCase() && (left.source ?? "").toLowerCase() === (right.source ?? "").toLowerCase();

/**
 * "+ spell": a spell search. An indexed pick adds that printing; a name the index does not know asks
 * for its source. The custom step and its input are editor state, so a remount (Resume, a
 * breakpoint) reopens the same form with what was typed.
 */
const AddSpellEditor: React.FC = () => {
  const edit = useActiveItemEdit();
  const [error, setError] = useEditorState<string | null>("spells.error", null);
  const [unknown, setUnknown] = useEditorState<string | null>("spells.unknown", null);
  const [query, setQuery] = useEditorState("spells.query", "");
  const add = (spell: SpellRef): string | undefined => {
    const spells = edit.draft.spells ?? [];
    if (spells.length >= ITEM_LIMITS.list) return `An item can list at most ${ITEM_LIMITS.list} spells.`;
    if (spells.some(other => sameSpell(other, spell))) return `${spellLabel(spell)} is already listed.`;
    return commitParse(edit, spellAddition(edit.draft, spell));
  };
  if (unknown !== null) return <CustomSpellEntry name={unknown} add={add} />;
  return (
    <div className={styles.spellSearch}>
      <SpellSearch
        label="Spell to add"
        focusOnMount
        query={query}
        onQueryChange={setQuery}
        onUnknown={setUnknown}
        onPick={spell => {
          const problem = add(spell.source ? { name: spell.name, source: spell.source } : { name: spell.name });
          if (problem) return setError(problem);
          edit.close(true);
        }}
        onEscape={() => edit.close(true)}
      />
      {error && <p role="alert" className={styles.spellError}>{error}</p>}
    </div>
  );
};

/**
 * A spell missing from the index: its name as typed, and an optional source so the reference names
 * a particular printing. Done adds it, checked by the shared validator.
 */
const CustomSpellEntry: React.FC<{ name: string; add: (spell: SpellRef) => string | undefined }> = ({ name: typed, add }) => {
  const [name, setName] = useEditorState("spells.customName", typed);
  const [source, setSource] = useEditorState("spells.customSource", "");
  const [error, setError] = useEditorState<string | null>("spells.customError", null);
  return (
    <PopoverForm
      error={error}
      onApply={() => {
        const spell = { name: name.trim(), source: source.trim() };
        const problem = add(spell.source ? spell : { name: spell.name });
        setError(problem ?? null);
        return !problem;
      }}
    >
      <p className={styles.hint}>Not in the spell index.</p>
      <Field label="Spell name">{id => <input id={id} value={name} onChange={event => setName(event.target.value)} />}</Field>
      <Field label="Spell source">
        {id => <input id={id} value={source} placeholder="optional" onChange={event => setSource(event.target.value)} />}
      </Field>
    </PopoverForm>
  );
};

/** The spells an item casts, as chips with their Remove, then "+ spell". */
export const ItemSpellsField: React.FC = () => {
  const edit = useActiveItemEdit();
  const spells = edit.draft.spells ?? [];
  return (
    <section className={styles.section} aria-label="Spells">
      <h3>Spells</h3>
      {/* A block: "+ spell" expands its editor inside it on a narrow screen. */}
      <div>
        {spells.map((spell, index) => (
          <span key={`${index}-${spell.name}|${spell.source ?? ""}`} className={liveStyles.entry}>
            {spellLabel(spell)}
            {/* An issue on this spell (`details.spells.1.name`) jumps to its chip's Remove. */}
            <RemoveLiveEntry
              label={`Remove spell ${spellLabel(spell)}`}
              onRemove={() => edit.commit({ spells: spells.filter((_, other) => other !== index) })}
              focusId="spells"
              targetIds={[`spells.${index}`]}
            />
          </span>
        ))}
        <EditTarget id="spells" label="spell" placeholder editor={<AddSpellEditor />} />
      </div>
    </section>
  );
};
