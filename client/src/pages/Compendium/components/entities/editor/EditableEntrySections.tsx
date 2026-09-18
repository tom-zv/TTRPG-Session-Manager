import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DnD5eEntityDetails, EntitySpellcasting } from "shared/domain/encounters/dnd5e/entity.js";
import { ItemLinks, SpellLinks } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCardSections.js";
import { getSectionTitle, normalizeEntrySection } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import cardStyles from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.module.css";
import { EditTarget } from "../../sheetEditor/EditTarget.js";
import { commitParse } from "../../sheetEditor/fieldSpec.js";
import { LiveInput, LiveSpecField } from "../../sheetEditor/live/LiveField.js";
import { LiveSourceText } from "../../sheetEditor/live/LiveSourceText.js";
import { useActiveEdit, useLiveRegion } from "./EntityEditContext.js";
import { EntryGrip, useEntryDrag, type EntryActions } from "./editors/EntryGrip.js";
import { EntryNameEditor, LegendaryCountEditor } from "./editors/InlineEditors.js";
import { entryFieldSpec, entryFields, LEGENDARY_COUNT_FIELD, type AddedEntry, type TextEntryRow } from "./model/fields.js";
import { LegendaryHeaderEditor } from "./editors/LegendaryHeaderEditor.js";
import { SpellcastingBlock } from "./editors/SpellcastingBlock.js";
import { entryKey } from "./model/entryKeys.js";
import {
  compareSections,
  entryId,
  insertItem,
  itemForSection,
  locateItem,
  moveItem,
  readLayout,
  removeItem,
  sectionChoices,
  writeLayout,
  type LayoutAt,
  type LayoutSection,
  type LayoutWrite,
} from "./model/entryLayout.js";
import { AUTO_SPELLCASTING } from "./model/inference.js";
import { setListHidden } from "./model/spellcastingFields.js";
import { RichText } from "../../RichText/RichText.js";
import { getAddableSections } from "./model/sectionCatalog.js";
import editStyles from "../../sheetEditor/SheetEditor.module.css";
import styles from "./editors/EntryCards.module.css";

/** The issue id prefix of the fields of a trait or action that is not in the draft yet. */
const ADDED_ID = "entries.added";
const ADD_SECTION_ID = "entries.addSection";
/** Text entries are dragged by their key, so they drop only on other text entries. */
const TEXT_ENTRY_DRAG_TYPE = "sheet-text-entry";

/** What "+ Add …" says in each standard section. */
const ENTRY_NOUNS: Record<string, string> = {
  trait: "trait",
  spellcasting: "spellcasting",
  action: "action",
  "bonus action": "bonus action",
  reaction: "reaction",
  legendary: "legendary action",
  mythic: "mythic action",
  lair: "lair action",
  regional: "regional effect",
  villain: "villain action",
};

type LayoutItem = LayoutSection["items"][number];
const isText = (item: LayoutItem) => item.kind !== "spellcasting";
const listOf = (item: LayoutItem) => (item.kind === "trait" ? "traits" : item.kind === "action" ? "actions" : "spellcasting");
const isBlank = (row: TextEntryRow) => !row.name.trim() && !row.description.trim();
const bufferKeys = (key: number) => ({ name: `entry[${key}].name`, text: `entry[${key}].description` });

/** Where the entry with this key is in the layout. */
const locateKey = (layout: readonly LayoutSection[], key: number): LayoutAt | null => {
  for (const [section, candidate] of layout.entries()) {
    const index = candidate.items.findIndex(item => entryKey(item.value) === key);
    if (index >= 0) return { section, item: index };
  }
  return null;
};

/**
 * The sheet's traits, actions, legendary text and spellcasting while editing, all edited in place.
 * A trait or action's name is a field and its text the source textarea; a spellcasting block's
 * name, text, ability line and spell lists are edited where they are shown
 * (`SpellcastingBlock`). Each entry has an "Entry options" grip to move or delete it. Every
 * section can add an entry, and "+ Add section" adds the first entry of a section that is not
 * there yet.
 */
export const EditableEntrySections: React.FC<{ entity: DnD5eEntityDetails }> = ({ entity }) => {
  const edit = useActiveEdit();
  const layout = useMemo(() => readLayout(entity, edit.modes.spellcasting), [entity, edit.modes.spellcasting]);
  // An added trait or action comes back after a remount (Resume, a breakpoint) while text typed into it is kept.
  const [added, setAdded] = useState<AddedEntry | null>(() => {
    const kept = (edit.buffer?.restoreAddedRow() as AddedEntry | null | undefined) ?? null;
    if (!kept) return null;
    const keys = bufferKeys(entryKey(kept.row));
    return edit.buffer?.restoreLive(keys.name) || edit.buffer?.restoreLive(keys.text) ? kept : null;
  });
  const [status, setStatus] = useState("");

  // Once its name or text applied, the added entry is in the draft, where it keeps its key.
  const addedKey = added ? entryKey(added.row) : null;
  const landed = addedKey !== null && locateKey(layout, addedKey) !== null;
  if (landed) setAdded(null);
  const shownAdded = landed ? null : added;
  useEffect(() => {
    edit.buffer?.keepAddedRow(shownAdded);
  });

  // A new entry's section joins the list where the sheet would show it.
  const sections = useMemo(() => {
    const newSection = shownAdded?.sectionKey;
    if (newSection === undefined || layout.some(section => section.key === newSection)) return layout;
    const shell: LayoutSection = { key: newSection, title: getSectionTitle(newSection), items: [] };
    return [...layout, shell].sort((left, right) => compareSections(left.key, right.key));
  }, [layout, shownAdded]);

  const commitWrite = (write: LayoutWrite) => edit.commit(write.patch, write.modes);

  // Spellcasting blocks ---------------------------------------------------------------------------

  /**
   * Adds a block named "Spellcasting" at the end of the section's blocks, one draft change, and
   * puts focus in its name (on targets, its name's editor opens) to type over it.
   */
  const startSpellcasting = (sectionKey: string) => {
    if (!edit.claim()) return;
    const value: EntitySpellcasting = { name: "Spellcasting", descriptions: [] };
    const item = itemForSection({ kind: "spellcasting", value, modes: AUTO_SPELLCASTING }, sectionKey);
    const write = writeLayout(layout, insertItem(layout, sectionKey, item), new Set(["spellcasting"]), item);
    const problem = commitWrite(write);
    if (problem) {
      setStatus(problem);
      return;
    }
    setStatus("");
    if (!write.tracked) return;
    if (edit.presentation === "live") edit.requestLiveFocus(`${write.tracked}.name`);
    else edit.open(`${write.tracked}.name`);
  };

  // Traits and actions ----------------------------------------------------------------------------

  /** Adds a blank trait or action at the end of the section's text entries and focuses its name. */
  const startText = (sectionKey: string, actionType: string) => {
    if (!edit.claim()) return;
    if (added) {
      const keys = bufferKeys(entryKey(added.row));
      const name = edit.buffer?.restoreLive(keys.name);
      const text = edit.buffer?.restoreLive(keys.text);
      if (name || text) {
        edit.requestLiveFocus(name ? `${ADDED_ID}.name` : `${ADDED_ID}.description`);
        return;
      }
    }
    const row: TextEntryRow = sectionKey === "trait" ? { name: "", description: "" } : { name: "", description: "", actionType };
    setAdded({ row, list: sectionKey === "trait" ? "traits" : "actions", sectionKey });
    setStatus("");
    edit.requestLiveFocus(`${ADDED_ID}.name`);
  };

  /**
   * Moves an entry to a position among its section's text entries, or to another section (at
   * `position`, or last). One draft change; focus follows the entry to its options button.
   */
  const relocate = (key: number, sectionKey: string, position?: number) => {
    if (!edit.claim()) return;
    const at = locateKey(layout, key);
    if (!at) return;
    const item = layout[at.section].items[at.item];
    const fromId = item.origin ? entryId(item.origin) : undefined;
    let next: LayoutSection[] | null;
    let current = item;
    if (layout[at.section].key === sectionKey) {
      if (position === undefined) return;
      next = moveItem(layout, at, position);
    } else {
      next = removeItem(layout, at);
      current = itemForSection(item, sectionKey);
      next = insertItem(next, sectionKey, current);
      const moved = position === undefined ? null : moveItem(next, locateItem(next, current)!, position);
      next = moved ?? next;
    }
    if (!next) return;
    const write = writeLayout(layout, next, new Set([listOf(item), listOf(current)]), current, fromId);
    if (commitWrite(write) || !write.tracked) return;
    setStatus("");
    edit.requestLiveFocus(`${write.tracked}.menu`);
  };

  const remove = (key: number, announce: boolean) => {
    const at = locateKey(layout, key);
    if (!at) return;
    const item = layout[at.section].items[at.item];
    const next = removeItem(layout, at);
    if (commitWrite(writeLayout(layout, next, new Set([listOf(item)]), undefined, item.origin ? entryId(item.origin) : undefined))) return;
    if (!announce) return;
    setStatus(`Deleted ${item.value.name.trim() || "the entry"}. Undo restores it.`);
    edit.closeTo(focusAfterRemoval(next[at.section], entity));
  };

  /** A blank entry left by focus is dropped: an added one was never in the draft. */
  const dropBlank = (key: number) => {
    if (addedKey === key) setAdded(current => (current && entryKey(current.row) === key ? null : current));
    else remove(key, false);
  };

  /**
   * What an entry's grip offers: its menu, and the same moves and deletion as grip shortcuts
   * (absent where the menu item is disabled).
   */
  const actionsFor = (
    key: number,
    section: LayoutSection,
    { index, count, offset = 0, kind, isAdded = false, extra = [] }: {
      /** Position among the entries of its group in the section (text entries, or blocks after them at `offset`). */
      index: number;
      count: number;
      offset?: number;
      kind: LayoutItem["kind"];
      isAdded?: boolean;
      /** Items of this kind of entry, listed before Delete. */
      extra?: EntryActions["items"];
    },
  ): EntryActions => {
    const moveUp = isAdded || index === 0 ? undefined : () => relocate(key, section.key, offset + index - 1);
    const moveDown = isAdded || index >= count - 1 ? undefined : () => relocate(key, section.key, offset + index + 1);
    const remove_ = () => {
      if (!edit.claim()) return;
      if (!isAdded) {
        remove(key, true);
        return;
      }
      const keys = bufferKeys(key);
      edit.buffer?.forgetLive(keys.name);
      edit.buffer?.forgetLive(keys.text);
      setAdded(null);
      edit.closeTo(`entries.add.${section.key}`);
    };
    return {
      moveUp,
      moveDown,
      remove: remove_,
      items: [
        { label: "Move up", disabled: !moveUp, onSelect: moveUp },
        { label: "Move down", disabled: !moveDown, onSelect: moveDown },
        {
          label: "Move to section ▸",
          disabled: isAdded,
          items: sectionChoices(layout, kind).map(choice => ({
            label: choice.title,
            disabled: choice.key === section.key,
            onSelect: () => relocate(key, choice.key),
          })),
        },
        ...extra,
        { label: "Delete", onSelect: remove_ },
      ],
    };
  };

  /** A block's "Hide spell list" / "Show spell list": one draft change, focus back on its grip. */
  const listVisibility = (key: number, id: string, hidden: boolean): EntryActions["items"][number] => ({
    label: hidden ? "Show spell list" : "Hide spell list",
    onSelect: () => {
      if (!edit.claim()) return;
      const problem = commitParse(edit, setListHidden(edit.draft, edit.modes, key, !hidden));
      setStatus(problem ?? "");
      if (!problem) edit.requestLiveFocus(`${id}.menu`);
    },
  });

  return (
    <SpellLinks.Provider value={undefined}>
      <ItemLinks.Provider value={undefined}>
        {sections.map(section => {
          const addId = `entries.add.${section.key}`;
          const addedHere = shownAdded?.sectionKey === section.key ? shownAdded : null;
          const texts = section.items.filter(isText);
          const kind = section.key === "trait" ? "trait" : "action";
          const textRow = (row: TextEntryRow, id: string, index: number, isAdded: boolean) => {
            const key = entryKey(row);
            const place = `${row.name.trim() || (isAdded ? "new entry" : "unnamed entry")}, ${section.title}`;
            return (
              <EntryRow
                key={`entry-${key}`}
                rowKey={key}
                id={id}
                row={row}
                place={place}
                added={isAdded ? addedHere ?? undefined : undefined}
                menuLabel={`Entry options for ${row.name.trim() || (isAdded ? "new entry" : "unnamed entry")}`}
                actions={actionsFor(key, section, { index, count: texts.length, kind, isAdded })}
                onLeftBlank={() => dropBlank(key)}
                onDropped={source => relocate(source, section.key, index)}
              />
            );
          };
          // "+ Add" follows what it adds: a trait or action comes before the section's spellcasting
          // blocks, which the sheet always lists last; "+ Add spellcasting" follows the blocks.
          const addButton = (
            <AddButton
              id={addId}
              label={`Add ${ENTRY_NOUNS[section.key] ?? `${section.title.toLowerCase()} entry`}`}
              onClick={() => (section.key === "spellcasting"
                ? startSpellcasting(section.key)
                : startText(section.key, section.items.find(candidate => candidate.kind === "action")?.value.actionType ?? section.key))}
            />
          );
          return (
            <section key={section.key} className={cardStyles.entrySection}>
              <h4 className={cardStyles.sectionTitle}>{section.title}</h4>
              <div className={cardStyles.section}>
                {section.key === "legendary" && <LegendaryControls entity={entity} />}
                {/* One list, so an added entry keeps its field (and focus) when it joins the draft. */}
                {[
                  ...texts.map((item, index) => textRow(item.value as TextEntryRow, entryId(item.origin!), index, false)),
                  ...(addedHere ? [textRow(addedHere.row, ADDED_ID, texts.length, true)] : []),
                ]}
                {section.key !== "spellcasting" && addButton}
                {section.items.filter(item => !isText(item)).map((item, index, blocks) => {
                  if (item.kind !== "spellcasting") return null;
                  const id = entryId(item.origin!);
                  const key = entryKey(item.value);
                  const name = item.value.name.trim() || "unnamed entry";
                  return (
                    <SpellcastingBlock
                      key={`block-${key}`}
                      rowKey={key}
                      id={id}
                      block={item.value}
                      place={`${name}, ${section.title}`}
                      menuLabel={`Entry options for ${name}`}
                      actions={actionsFor(key, section, {
                        index,
                        count: blocks.length,
                        offset: texts.length,
                        kind: "spellcasting",
                        extra: [listVisibility(key, id, Boolean(item.value.hideSpellList))],
                      })}
                      onDropped={source => relocate(source, section.key, texts.length + index)}
                      announce={setStatus}
                    />
                  );
                })}
                {section.key === "spellcasting" && addButton}
              </div>
            </section>
          );
        })}
        <AddSectionMenu
          sections={sections}
          onChoose={(sectionKey, kind, actionType) => (kind === "spellcasting"
            ? startSpellcasting(sectionKey)
            : startText(sectionKey, actionType ?? sectionKey))}
        />
        <p role="status" className={styles.status}>{edit.activeId === null ? status : ""}</p>
      </ItemLinks.Provider>
    </SpellLinks.Provider>
  );
};

/**
 * Where focus goes after an entry is removed: its section's "+ Add" while the section is still
 * shown, otherwise "+ Add section", which is always there.
 */
const focusAfterRemoval = (section: LayoutSection, entity: DnD5eEntityDetails): string => {
  const kept = section.items.length > 0 || (section.key === "legendary" && (entity.legendaryHeader?.length || entity.legendaryActionCount));
  return kept ? `entries.add.${section.key}` : ADD_SECTION_ID;
};

/** Focus comes back to this target when an editor that closed, or a removal, asked for it. */
const useTakesFocus = (id: string) => {
  const edit = useActiveEdit();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (edit.takeFocus(id)) ref.current?.focus();
  });
  return ref;
};

const endsSentence = (name: string) => /[.!?]$/.test(name.trim());

type EntryRowProps = {
  /** The entry's key (`entryKey`), which follows it through moves. */
  rowKey: number;
  /** The entry's validator path (`actions.3`), or the added entry's id. */
  id: string;
  row: TextEntryRow;
  /** Names the entry in its fields' labels: "Bite, Actions". */
  place: string;
  /** Set while the entry is not in the draft yet. */
  added?: AddedEntry;
  menuLabel: string;
  actions: EntryActions;
  /** Focus left the entry while its name and text were blank. */
  onLeftBlank: () => void;
  /** Another text entry, by its key, was dropped on this one. */
  onDropped: (sourceKey: number) => void;
};

/**
 * A trait or action in edit mode, laid out as the sheet shows it: the bold run-in name as a field
 * sized by its text, then the text, which opens into its source in place. Its ⠿ grip comes last in
 * Tab order and sits in the margin left of the entry, never over its text: dragging it moves the
 * entry, a click opens its options, and while it has focus Alt+Up / Alt+Down move the entry and
 * Delete removes it. On touch the grip takes a column of its own. On touch and narrow screens the
 * name opens its inline editor (an added entry keeps its name a field until focus leaves it); the
 * text is the same.
 */
const EntryRow: React.FC<EntryRowProps> = ({ rowKey, id, row, place, added, menuLabel, actions, onLeftBlank, onDropped }) => {
  const edit = useActiveEdit();
  const liveAt = useLiveRegion();
  const { rowRef, rowProps, arm } = useEntryDrag({ type: TEXT_ENTRY_DRAG_TYPE, rowKey, name: row.name, onDropped });
  const fields = entryFields({ key: rowKey, id, place, added });
  const keys = bufferKeys(rowKey);
  // On targets an added entry's name is typed in place, like a live field, until focus leaves it.
  const [holding, setHolding] = useState(added !== undefined);
  const nameLive = liveAt(fields.name.id) || edit.buffer?.restoreLive(keys.name) !== undefined || holding;

  // Focus leaving the entry with nothing in it drops it. Checked after the blur's commit renders.
  const [left, setLeft] = useState(0);
  const latest = useRef({ row, onLeftBlank });
  useEffect(() => {
    latest.current = { row, onLeftBlank };
  });
  useEffect(() => {
    if (left === 0 || rowRef.current?.contains(document.activeElement)) return;
    if (edit.buffer?.restoreLive(keys.name) || edit.buffer?.restoreLive(keys.text)) return;
    if (isBlank(latest.current.row)) latest.current.onLeftBlank();
    // Only a new blur checks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const name = row.name.trim();
  return (
    <div
      {...rowProps}
      className={`${styles.entryRow} ${rowProps.className}`}
      onBlur={event => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setLeft(count => count + 1);
      }}
    >
      {/* One line as view mode draws it: the bold run-in name, then the text continuing its line. */}
      <div className={`${cardStyles.entry} ${styles.entryHead}`}>
        <strong className={`${cardStyles.entryName} ${styles.entryName}`}>
          {nameLive ? (
            <span onBlur={() => setHolding(false)}>
              <LiveInput
                id={fields.name.id}
                bufferKey={keys.name}
                label={fields.name.label}
                read={fields.name.read}
                parse={fields.name.parse}
                placeholder="Name"
              />
            </span>
          ) : (
            <EditTarget id={fields.name.id} kind="inline" label={fields.name.label} editor={<EntryNameEditor spec={entryFieldSpec(fields.name)} />}>
              {name || <span className={styles.unnamed}>Name</span>}
            </EditTarget>
          )}
          {name && !endsSentence(name) && "."}
        </strong>{" "}
        <LiveSourceText
          id={fields.text.id}
          bufferKey={keys.text}
          label={fields.text.label}
          read={fields.text.read}
          parse={fields.text.parse}
          placeholder="Text. Type { to link a spell or item."
          inline
          className={cardStyles.entryText}
        />
      </div>
      {/* After the text, so Tab goes name, text, grip. An added entry cannot be dragged yet. */}
      <EntryGrip id={id} label={menuLabel} actions={actions} rowRef={rowRef} arm={added ? undefined : arm} />
    </div>
  );
};

const AddButton: React.FC<{ id: string; label: string; onClick: () => void }> = ({ id, label, onClick }) => {
  const ref = useTakesFocus(id);
  // Stays in the column of the entry above it (`sheetColumns.ts`).
  return <button ref={ref} type="button" className={`${editStyles.placeholder} ${styles.addEntry}`} data-column-keep onClick={onClick}>+ {label}</button>;
};

/** The legendary section's count and introduction, edited where they are shown. */
const LegendaryControls: React.FC<{ entity: DnD5eEntityDetails }> = ({ entity }) => {
  const live = useLiveRegion()("legendaryActionCount");
  const count = entity.legendaryActionCount;
  const header = entity.legendaryHeader ?? [];
  return (
    <div className={styles.legendary}>
      <p className={cardStyles.sectionIntro}>
        <strong>Legendary Action Uses:</strong>{" "}
        {live ? <LiveSpecField spec={LEGENDARY_COUNT_FIELD} /> : count ? (
          <EditTarget id="legendaryActionCount" kind="inline" label={`Legendary actions per round, ${count}`} editor={<LegendaryCountEditor />}>
            {count}
          </EditTarget>
        ) : (
          <EditTarget id="legendaryActionCount" kind="inline" label="Legendary actions per round" placeholder editor={<LegendaryCountEditor />} />
        )}
      </p>
      {header.length > 0 ? (
        <EditTarget id="legendaryHeader" label="Legendary introduction" editor={<LegendaryHeaderEditor />}>
          {/* As the sheet shows it, with links as plain text; the editor shows the tags. */}
          {header.map((paragraph, index) => (
            <RichText key={`${index}-${paragraph}`} inline text={paragraph} className={styles.paragraph} />
          ))}
        </EditTarget>
      ) : (
        <EditTarget id="legendaryHeader" label="Legendary introduction" placeholder editor={<LegendaryHeaderEditor />} />
      )}
    </div>
  );
};

type AddSectionMenuProps = {
  sections: readonly LayoutSection[];
  onChoose: (sectionKey: string, kind: "trait" | "action" | "spellcasting", actionType?: string) => void;
};

/** "+ Add section": the standard sections the sheet does not have yet, Spellcasting, and a custom one. */
const AddSectionMenu: React.FC<AddSectionMenuProps> = ({ sections, onChoose }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const triggerRef = useTakesFocus(ADD_SECTION_ID);
  const options = getAddableSections(sections);
  const close = () => {
    setOpen(false);
    setCustom(null);
    triggerRef.current?.focus();
  };

  return (
    // Escape from any control in the menu closes only the menu.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.addSection}
      onKeyDown={event => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <button ref={triggerRef} type="button" className={editStyles.placeholder} aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        + Add section
      </button>
      {open && custom === null && (
        <ul className={styles.menu} aria-label="Sections to add">
          {options.map(option => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => {
                  if (option.key === "custom") {
                    setCustom("");
                    return;
                  }
                  setOpen(false);
                  onChoose(option.key, option.list === "traits" ? "trait" : option.list === "spellcasting" ? "spellcasting" : "action");
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && custom !== null && (
        <form
          className={styles.row}
          aria-label="Custom section"
          onSubmit={event => {
            event.preventDefault();
            const name = custom.trim();
            if (!name) return;
            setOpen(false);
            setCustom(null);
            const key = normalizeEntrySection(name);
            onChoose(key, key === "trait" ? "trait" : "action", key === name.toLowerCase() ? key : name);
          }}
        >
          <input
            aria-label="Section name"
            // The field appears because the GM asked for it.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            maxLength={64}
            value={custom}
            onChange={event => setCustom(event.target.value)}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={close}>Cancel</button>
        </form>
      )}
    </div>
  );
};
