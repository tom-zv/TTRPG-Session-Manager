import React, { useEffect, useMemo, useRef, useState } from "react";
import { MdMoreHoriz } from "react-icons/md";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ItemLinks,
  SpellcastingEntry,
  SpellLinks,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCardSections.js";
import { getSectionTitle, normalizeEntrySection } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import cardStyles from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.module.css";
import { useDragSource } from "src/hooks/useDragSource.js";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { ActionMenu, type ActionMenuItem } from "../../ActionMenu/ActionMenu.js";
import { EditTarget } from "../../sheetEditor/EditTarget.js";
import { ENTRY_DRAG_TYPE, type EntryCardHost, type EntryDropHandler } from "../../sheetEditor/EntryCardFrame.js";
import { LiveInput, LiveSpecField, useLiveTarget } from "../../sheetEditor/live/LiveField.js";
import { LiveSourceText } from "../../sheetEditor/live/LiveSourceText.js";
import { useActiveEdit, useLiveRegion } from "./EntityEditContext.js";
import { EntryNameEditor, LegendaryCountEditor } from "./editors/InlineEditors.js";
import { entryFieldSpec, entryFields, LEGENDARY_COUNT_FIELD, type AddedEntry, type TextEntryRow } from "./model/fields.js";
import { LegendaryHeaderEditor } from "./editors/LegendaryHeaderEditor.js";
import { SpellcastingCard } from "./editors/SpellcastingCard.js";
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
  replaceItem,
  sectionChoices,
  writeItem,
  writeLayout,
  type LayoutAt,
  type LayoutItem,
  type LayoutSection,
  type LayoutWrite,
} from "./model/entryLayout.js";
import { AUTO_SPELLCASTING } from "./model/inference.js";
import { RichText } from "../../RichText/RichText.js";
import { getAddableSections } from "./model/sectionCatalog.js";
import editStyles from "../../sheetEditor/SheetEditor.module.css";
import styles from "./editors/EntryCards.module.css";

/** The editor id of the card for a spellcasting block that is not in the draft yet. */
const NEW_ENTRY_ID = "entries.new";
/** The issue id prefix of the fields of a trait or action that is not in the draft yet. */
const ADDED_ID = "entries.added";
const ADD_SECTION_ID = "entries.addSection";
/** Text entries are dragged by their key, spellcasting cards by their position, so the two never mix. */
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

/** A new spellcasting block whose card is open; it joins the draft when the card saves with something in it. */
type Pending = { sectionKey: string; item: LayoutItem; returnId: string; serial: number };

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
 * The sheet's traits, actions, legendary text and spellcasting while editing. A trait or action is
 * edited in place: its name is a field and its text the source textarea, with an "Entry options"
 * menu to move or delete it. A spellcasting block renders as in view mode, with links as plain
 * text, and opens as a card when clicked. Every section can add an entry, and "+ Add section" adds
 * the first entry of a section that is not there yet.
 */
export const EditableEntrySections: React.FC<{ entity: DnD5eEntityDetails }> = ({ entity }) => {
  const edit = useActiveEdit();
  const layout = useMemo(() => readLayout(entity, edit.modes.spellcasting), [entity, edit.modes.spellcasting]);
  // A new block's card reopens after a reader remount from the draft slot's buffer.
  const [pending, setPending] = useState<Pending | null>(() => {
    return edit.activeId === NEW_ENTRY_ID ? (edit.buffer?.restoreNewEntry() as Pending | null | undefined) ?? null : null;
  });
  // An added trait or action comes back after a remount (Resume, a breakpoint) while text typed into it is kept.
  const [added, setAdded] = useState<AddedEntry | null>(() => {
    const kept = (edit.buffer?.restoreAddedRow() as AddedEntry | null | undefined) ?? null;
    if (!kept) return null;
    const keys = bufferKeys(entryKey(kept.row));
    return edit.buffer?.restoreLive(keys.name) || edit.buffer?.restoreLive(keys.text) ? kept : null;
  });
  const [status, setStatus] = useState("");
  const [channel] = useState(createCardChannel);
  const openPending = pending && edit.activeId === NEW_ENTRY_ID ? pending : null;
  useEffect(() => {
    if (edit.activeId === NEW_ENTRY_ID) edit.buffer?.keepNewEntry(openPending);
  });

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
    const newSection = openPending?.sectionKey ?? shownAdded?.sectionKey;
    if (newSection === undefined || layout.some(section => section.key === newSection)) return layout;
    const shell: LayoutSection = { key: newSection, title: getSectionTitle(newSection), items: [] };
    return [...layout, shell].sort((left, right) => compareSections(left.key, right.key));
  }, [layout, openPending, shownAdded]);

  const commitWrite = (write: LayoutWrite) => {
    const problem = edit.commit(write.patch, write.modes);
    if (!problem) channel.setMoved(write.moved);
    return problem;
  };

  // Spellcasting cards ----------------------------------------------------------------------------

  const save = (at: LayoutAt | null, sectionKey: string, item: LayoutItem | null, move?: { to?: number; section?: string }) => {
    const before = at ? layout[at.section].items[at.item] : null;
    const fromId = before?.origin ? entryId(before.origin) : undefined;
    if (item === null) {
      if (!at || !before) return {};
      const next = removeItem(layout, at);
      const problem = commitWrite(writeLayout(layout, next, new Set([listOf(before)]), undefined, fromId));
      return { problem, id: problem ? undefined : focusAfterRemoval(next[at.section], entity) };
    }
    const staysPut = move?.to === undefined && (move?.section === undefined || move.section === sectionKey);
    if (before?.origin && staysPut) {
      // An untouched card changes nothing; an edited one replaces its own row only.
      if (item === before) return { id: fromId };
      return { problem: commitWrite(writeItem(entity, edit.modes.spellcasting, { ...item, origin: before.origin })), id: fromId };
    }
    let next = at ? replaceItem(layout, at, item) : insertItem(layout, sectionKey, item);
    let current = item;
    if (move?.section !== undefined && move.section !== sectionKey) {
      next = removeItem(next, locateItem(next, item)!);
      current = itemForSection(item, move.section);
      next = insertItem(next, move.section, current);
    } else if (move?.to !== undefined) {
      const moved = moveItem(next, locateItem(next, item)!, move.to);
      if (!moved) return { problem: "This entry cannot move there." };
      next = moved;
    }
    const write = writeLayout(layout, next, new Set([listOf(before ?? item), listOf(current)]), current, fromId);
    const problem = commitWrite(write);
    return { problem, id: write.tracked };
  };

  /** Opens a block's card, by the id the block has once the open card has saved. */
  const openEntry = (id: string) => {
    channel.setMoved(null);
    edit.open(() => {
      const moved = channel.takeMoved();
      return moved?.has(id) ? moved.get(id) ?? null : id;
    });
  };

  const host = (
    id: string,
    item: LayoutItem,
    section: LayoutSection,
    at: LayoutAt | null,
    returnId: string,
  ): EntryCardHost<LayoutItem> => {
    // Blocks come after the section's text entries; positions count among the blocks.
    const blocks = section.items.filter(candidate => !isText(candidate));
    const offset = section.items.length - blocks.length;
    return {
      id,
      label: `${item.value.name.trim() || (at ? "unnamed entry" : "new entry")}, ${section.title}`,
      item,
      isNew: at === null,
      sectionKey: section.key,
      group: "spellcasting",
      position: at ? { index: at.item - offset, count: blocks.length } : { index: 0, count: 1 },
      sectionChoices: sectionChoices(layout, item.kind),
      save: (value, move) => save(at, section.key, value, move?.to !== undefined && at ? { to: move.to + offset } : move),
      returnId,
      initialFocus: () => channel.initialFocusFor(id),
      setInitialFocus: channel.setInitialFocus,
      registerDrop: channel.registerDrop,
      announce: setStatus,
    };
  };

  const startSpellcasting = (sectionKey: string, returnId: string) => {
    // The open editor saves first; an invalid one stays open, and no new card starts.
    if (!edit.open(NEW_ENTRY_ID)) return;
    const item = itemForSection({ kind: "spellcasting", value: { name: "", descriptions: [] }, modes: AUTO_SPELLCASTING }, sectionKey);
    setPending(previous => ({ sectionKey, item, returnId, serial: (previous?.serial ?? 0) + 1 }));
    setStatus("");
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

  const menuFor = (key: number, section: LayoutSection, index: number, count: number, kind: "trait" | "action", isAdded: boolean): ActionMenuItem[] => [
    { label: "Move up", disabled: isAdded || index === 0, onSelect: () => relocate(key, section.key, index - 1) },
    { label: "Move down", disabled: isAdded || index >= count - 1, onSelect: () => relocate(key, section.key, index + 1) },
    {
      label: "Move to section ▸",
      disabled: isAdded,
      items: sectionChoices(layout, kind).map(choice => ({
        label: choice.title,
        disabled: choice.key === section.key,
        onSelect: () => relocate(key, choice.key),
      })),
    },
    {
      label: "Delete",
      onSelect: () => {
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
      },
    },
  ];

  // A new card remounts for each "+ Add", so it never keeps the fields of the previous one.
  const renderCard = (cardHost: EntryCardHost<LayoutItem>, key: string) =>
    cardHost.item.kind === "spellcasting" ? <SpellcastingCard key={key} host={cardHost} item={cardHost.item} /> : null;

  return (
    <SpellLinks.Provider value={undefined}>
      <ItemLinks.Provider value={undefined}>
        {sections.map((section, sectionIndex) => {
          const addId = `entries.add.${section.key}`;
          const pendingHere = openPending?.sectionKey === section.key ? openPending : null;
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
                menuItems={menuFor(key, section, index, texts.length, kind, isAdded)}
                onLeftBlank={() => dropBlank(key)}
                onDropped={source => relocate(source, section.key, index)}
              />
            );
          };
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
                {section.items.map((item, index) => {
                  if (isText(item)) return null;
                  const id = entryId(item.origin!);
                  const at = { section: sectionIndex, item: index };
                  return edit.activeId === id
                    ? renderCard(host(id, item, section, at, addId), `${id}#${entryKey(item.value)}`)
                    : (
                      <EntrySlot
                        key={id}
                        id={id}
                        item={item}
                        label={`${item.value.name.trim() || "unnamed entry"}, ${section.title}`}
                        sectionKey={section.key}
                        position={index - texts.length}
                        onOpen={openEntry}
                        onDrop={channel.dropOn}
                      />
                    );
                })}
                {pendingHere && renderCard(host(NEW_ENTRY_ID, pendingHere.item, section, null, pendingHere.returnId), `new-${pendingHere.serial}`)}
                <AddButton
                  id={addId}
                  label={`Add ${ENTRY_NOUNS[section.key] ?? `${section.title.toLowerCase()} entry`}`}
                  onClick={() => (section.key === "spellcasting"
                    ? startSpellcasting(section.key, addId)
                    : startText(section.key, section.items.find(candidate => candidate.kind === "action")?.value.actionType ?? section.key))}
                />
              </div>
            </section>
          );
        })}
        <AddSectionMenu
          sections={sections}
          onChoose={(sectionKey, kind, actionType) => (kind === "spellcasting"
            ? startSpellcasting(sectionKey, ADD_SECTION_ID)
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

/**
 * What passes between the sections and an open spellcasting card outside rendering: the control a
 * card reopened by a move focuses, the open card's drop handler, and where the entries went in the
 * last entry commit (a block clicked while another card was open may have a new id once that card
 * saves). Created once per sections.
 */
const createCardChannel = () => {
  let initialFocus: { id: string; control: string } | null = null;
  let drop: EntryDropHandler | null = null;
  let moved: LayoutWrite["moved"] | null = null;
  return {
    setMoved: (next: LayoutWrite["moved"] | null) => {
      moved = next;
    },
    takeMoved: (): LayoutWrite["moved"] | null => {
      const last = moved;
      moved = null;
      return last;
    },
    initialFocusFor: (id: string): string | null => (initialFocus?.id === id ? initialFocus.control : null),
    setInitialFocus: (id: string | null, control?: string) => {
      initialFocus = id && control ? { id, control } : null;
    },
    registerDrop: (handler: EntryDropHandler | null) => {
      drop = handler;
    },
    dropOn: (target: Parameters<EntryDropHandler>[0]) => drop?.(target),
  };
};

/** Focus comes back to this target when a card that closed, or a removal, asked for it. */
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
  menuItems: ActionMenuItem[];
  /** Focus left the entry while its name and text were blank. */
  onLeftBlank: () => void;
  /** Another text entry, by its key, was dropped on this one. */
  onDropped: (sourceKey: number) => void;
};

/**
 * A trait or action in edit mode, laid out as the sheet shows it: the bold run-in name as a field
 * sized by its text, the text as its source textarea, and the "⋯" entry options, last in Tab order
 * and drawn at the end of the name's line, whose place is always kept. On touch and narrow screens the name opens its inline
 * editor (an added entry keeps its name a field until focus leaves it); the text is the same.
 */
const EntryRow: React.FC<EntryRowProps> = ({ rowKey, id, row, place, added, menuLabel, menuItems, onLeftBlank, onDropped }) => {
  const edit = useActiveEdit();
  const liveAt = useLiveRegion();
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useLiveTarget([`${id}.menu`], menuRef);
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

  const { dropAreaProps } = useDropTarget<{ index: number }>({
    acceptedTypes: [TEXT_ENTRY_DRAG_TYPE],
    onItemsDropped: async items => {
      const source = items[0]?.index;
      if (source !== undefined && source !== rowKey) onDropped(source);
    },
  });
  const { handleDragStart, handleDragEnd } = useDragSource<{ index: number }>({
    contentType: TEXT_ENTRY_DRAG_TYPE,
    mode: "reorder",
    getItemId: item => item.index,
    getItemName: () => row.name,
  });

  const name = row.name.trim();
  return (
    <div
      ref={rowRef}
      {...dropAreaProps}
      className={`${styles.entryRow} ${dropAreaProps.className}`}
      onBlur={event => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setLeft(count => count + 1);
      }}
    >
      <p className={`${cardStyles.entry} ${styles.entryHead}`}>
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
        </strong>
      </p>
      <div className={styles.entryText}>
        <LiveSourceText
          id={fields.text.id}
          bufferKey={keys.text}
          label={fields.text.label}
          read={fields.text.read}
          parse={fields.text.parse}
          placeholder="Text. Type { to link a spell or item."
        />
      </div>
      {/* After the text, so Tab goes name, text, options; drawn at the end of the name's line. */}
      {/* Always there, so hover and focus move nothing; focusing it settles any open editor. */}
      <span className={styles.entryTools} onFocus={() => void edit.claim()}>
        {!added && (
          <span
            className={styles.dragHandle}
            draggable
            title="Drag onto another entry to move it there"
            aria-hidden="true"
            onDragStart={event => handleDragStart(event, [{ index: rowKey }])}
            onDragEnd={handleDragEnd}
          >
            ⠿
          </span>
        )}
        <ActionMenu
          label={menuLabel}
          items={menuItems}
          beforeOpen={() => edit.claim()}
          icon={<MdMoreHoriz aria-hidden="true" />}
          triggerRef={menuRef}
        />
      </span>
    </div>
  );
};

type EntrySlotProps = {
  id: string;
  item: LayoutItem;
  label: string;
  sectionKey: string;
  /** Position among the section's spellcasting blocks, where a dropped card lands. */
  position: number;
  onOpen: (id: string) => void;
  onDrop: EntryDropHandler;
};

/** A spellcasting block as the sheet shows it; its name is the button that opens its card, and so is a click on its text. */
const EntrySlot: React.FC<EntrySlotProps> = ({ id, item, label, sectionKey, position, onOpen, onDrop }) => {
  const triggerRef = useTakesFocus(id);
  const { dropAreaProps } = useDropTarget<{ index: number }>({
    acceptedTypes: [ENTRY_DRAG_TYPE],
    onItemsDropped: async () => onDrop({ sectionKey, group: "spellcasting", position }),
  });
  const renderName = (formatted: string) => (
    <button ref={triggerRef} type="button" className={editStyles.target} aria-label={`Edit ${label}`} aria-expanded={false} onClick={() => onOpen(id)}>
      {formatted}
    </button>
  );
  if (item.kind !== "spellcasting") return null;

  return (
    // The name is the keyboard target; a click anywhere on the text is the same for a pointer.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      {...dropAreaProps}
      className={`${styles.slot} ${dropAreaProps.className}`}
      onClick={event => {
        if (!(event.target instanceof Element) || !event.target.closest("button, a, input, textarea, select")) onOpen(id);
      }}
    >
      <SpellcastingEntry spellcasting={item.value} renderName={renderName} />
    </div>
  );
};

const AddButton: React.FC<{ id: string; label: string; onClick: () => void }> = ({ id, label, onClick }) => {
  const ref = useTakesFocus(id);
  return <button ref={ref} type="button" className={editStyles.placeholder} onClick={onClick}>+ {label}</button>;
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
