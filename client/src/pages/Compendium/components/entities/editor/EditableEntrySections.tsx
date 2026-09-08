import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ItemLinks,
  SpellcastingEntry,
  SpellLinks,
  TextEntry,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCardSections.js";
import { getSectionTitle, normalizeEntrySection } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import cardStyles from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.module.css";
import { useDropTarget } from "src/hooks/useDropTarget.js";
import { EditTarget } from "../../sheetEditor/EditTarget.js";
import { useActiveEdit, useLiveRegion } from "./EntityEditContext.js";
import { ENTRY_DRAG_TYPE, type EntryCardHost, type EntryDropHandler } from "../../sheetEditor/EntryCardFrame.js";
import { LegendaryCountEditor } from "./editors/InlineEditors.js";
import { LiveSpecField } from "../../sheetEditor/live/LiveField.js";
import { LEGENDARY_COUNT_FIELD } from "./model/fields.js";
import { LegendaryHeaderEditor } from "./editors/LegendaryHeaderEditor.js";
import { SpellcastingCard } from "./editors/SpellcastingCard.js";
import { TextEntryCard } from "./editors/TextEntryCard.js";
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

/** The editor id of the card for an entry that is not in the draft yet. */
const NEW_ENTRY_ID = "entries.new";
const ADD_SECTION_ID = "entries.addSection";

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

/** A new entry whose card is open; it joins the draft when the card saves with something in it. */
type Pending = { sectionKey: string; item: LayoutItem; returnId: string; serial: number };

const blankItem = (sectionKey: string, kind: "trait" | "action" | "spellcasting", actionType = sectionKey): LayoutItem => {
  if (kind === "spellcasting") {
    return itemForSection({ kind: "spellcasting", value: { name: "", descriptions: [] }, modes: AUTO_SPELLCASTING }, sectionKey);
  }
  return kind === "trait" ? { kind: "trait", value: { name: "", description: "" } } : { kind: "action", value: { name: "", description: "", actionType } };
};

const isText = (item: LayoutItem) => item.kind !== "spellcasting";
/** Entries move among text entries, or among spellcasting blocks, of a section. */
const dropGroup = (item: LayoutItem) => (isText(item) ? "text" : "spellcasting");

// A card's React key follows the entry's row object, not only its id: after a move renumbers the
// list, the same id can name another entry, whose card must not keep the previous one's fields.
const rowKeys = new WeakMap<object, number>();
let lastRowKey = 0;
const rowKey = (value: object): number => {
  let key = rowKeys.get(value);
  if (key === undefined) {
    key = ++lastRowKey;
    rowKeys.set(value, key);
  }
  return key;
};
const listOf = (item: LayoutItem) => (item.kind === "trait" ? "traits" : item.kind === "action" ? "actions" : "spellcasting");

/**
 * The sheet's traits, actions, legendary text and spellcasting while editing. Each entry renders
 * as in view mode, with links as plain text, and opens as a card when clicked. Every section can
 * add an entry, and "+ Add section" adds the first entry of a section that is not there yet.
 */
export const EditableEntrySections: React.FC<{ entity: DnD5eEntityDetails }> = ({ entity }) => {
  const edit = useActiveEdit();
  const layout = useMemo(() => readLayout(entity, edit.modes.spellcasting), [entity, edit.modes.spellcasting]);
  // A new entry's card reopens after a reader remount from the draft slot's buffer.
  const [pending, setPending] = useState<Pending | null>(() => {
    return edit.activeId === NEW_ENTRY_ID ? (edit.buffer?.restoreNewEntry() as Pending | null | undefined) ?? null : null;
  });
  const [status, setStatus] = useState("");
  const [channel] = useState(createCardChannel);
  const openPending = pending && edit.activeId === NEW_ENTRY_ID ? pending : null;
  useEffect(() => {
    if (edit.activeId === NEW_ENTRY_ID) edit.buffer?.keepNewEntry(openPending);
  });

  // The pending entry's section joins the list where the sheet would show it.
  const sections = useMemo(() => {
    if (!openPending || layout.some(section => section.key === openPending.sectionKey)) return layout;
    const shell: LayoutSection = { key: openPending.sectionKey, title: getSectionTitle(openPending.sectionKey), items: [] };
    return [...layout, shell].sort((left, right) => compareSections(left.key, right.key));
  }, [layout, openPending]);

  const commitWrite = (write: LayoutWrite) => {
    const problem = edit.commit(write.patch, write.modes);
    if (!problem) channel.setMoved(write.moved);
    return problem;
  };

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

  /** Opens an entry's card, by the id the entry has once the open card has saved. */
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
    const group = section.items.filter(candidate => isText(candidate) === isText(item));
    return {
      id,
      label: `${item.value.name.trim() || (at ? "unnamed entry" : "new entry")}, ${section.title}`,
      item,
      isNew: at === null,
      sectionKey: section.key,
      group: dropGroup(item),
      position: at ? { index: at.item - (isText(item) ? 0 : section.items.length - group.length), count: group.length } : { index: 0, count: 1 },
      sectionChoices: sectionChoices(layout, item.kind),
      save: (value, move) => {
        if (move?.to !== undefined && at) {
          // Positions count within the group; the layout counts every item of the section.
          const offset = isText(item) ? 0 : section.items.length - group.length;
          return save(at, section.key, value, { to: move.to + offset });
        }
        return save(at, section.key, value, move);
      },
      returnId,
      initialFocus: () => channel.initialFocusFor(id),
      setInitialFocus: channel.setInitialFocus,
      registerDrop: channel.registerDrop,
      announce: setStatus,
    };
  };

  const startNew = (sectionKey: string, kind: "trait" | "action" | "spellcasting", returnId: string, actionType?: string) => {
    // The open editor saves first; an invalid one stays open, and no new card starts.
    if (!edit.open(NEW_ENTRY_ID)) return;
    setPending(previous => ({ sectionKey, item: blankItem(sectionKey, kind, actionType), returnId, serial: (previous?.serial ?? 0) + 1 }));
    setStatus("");
  };

  // A new card remounts for each "+ Add", so it never keeps the fields of the previous one.
  const renderCard = (cardHost: EntryCardHost<LayoutItem>, key: string) =>
    cardHost.item.kind === "spellcasting"
      ? <SpellcastingCard key={key} host={cardHost} item={cardHost.item} />
      : <TextEntryCard key={key} host={cardHost} item={cardHost.item} />;

  return (
    <SpellLinks.Provider value={undefined}>
      <ItemLinks.Provider value={undefined}>
        {sections.map((section, sectionIndex) => {
          const addId = `entries.add.${section.key}`;
          const pendingHere = openPending?.sectionKey === section.key ? openPending : null;
          const pendingCard = pendingHere
            && renderCard(host(NEW_ENTRY_ID, pendingHere.item, section, null, pendingHere.returnId), `new-${pendingHere.serial}`);
          const textCount = section.items.filter(isText).length;
          return (
            <section key={section.key} className={cardStyles.entrySection}>
              <h4 className={cardStyles.sectionTitle}>{section.title}</h4>
              <div className={cardStyles.section}>
                {section.key === "legendary" && <LegendaryControls entity={entity} />}
                {section.items.map((item, index) => {
                  const id = entryId(item.origin!);
                  const at = { section: sectionIndex, item: index };
                  return (
                    <React.Fragment key={id}>
                      {pendingHere && isText(pendingHere.item) && index === textCount && pendingCard}
                      {edit.activeId === id
                        ? renderCard(host(id, item, section, at, addId), `${id}#${rowKey(item.value)}`)
                        : (
                          <EntrySlot
                            id={id}
                            item={item}
                            label={`${item.value.name.trim() || "unnamed entry"}, ${section.title}`}
                            sectionKey={section.key}
                            position={isText(item) ? index : index - textCount}
                            onOpen={openEntry}
                            onDrop={channel.dropOn}
                          />
                        )}
                    </React.Fragment>
                  );
                })}
                {pendingHere && (!isText(pendingHere.item) || textCount === section.items.length) && pendingCard}
                <AddButton
                  id={addId}
                  label={`Add ${ENTRY_NOUNS[section.key] ?? `${section.title.toLowerCase()} entry`}`}
                  onClick={() => startNew(
                    section.key,
                    section.key === "trait" ? "trait" : section.key === "spellcasting" ? "spellcasting" : "action",
                    addId,
                    section.items.find(candidate => candidate.kind === "action")?.value.actionType,
                  )}
                />
              </div>
            </section>
          );
        })}
        <AddSectionMenu
          sections={sections}
          onChoose={(sectionKey, kind, actionType) => startNew(sectionKey, kind, ADD_SECTION_ID, actionType)}
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
 * What passes between the sections and their open card outside rendering: the control a card
 * reopened by a move focuses, the open card's drop handler, and where the entries went in the
 * last entry commit (an entry clicked while another card was open may have a new id once that
 * card saves). Created once per sections.
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

/** Focus comes back to this target when a card that closed asked for it. */
const useTakesFocus = (id: string, active: boolean) => {
  const edit = useActiveEdit();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active && edit.takeFocus(id)) ref.current?.focus();
  });
  return ref;
};

type EntrySlotProps = {
  id: string;
  item: LayoutItem;
  label: string;
  sectionKey: string;
  /** Position among the entries of its group, where a dropped card lands. */
  position: number;
  onOpen: (id: string) => void;
  onDrop: EntryDropHandler;
};

/** An entry as the sheet shows it; its name is the button that opens its card, and so is a click on its text. */
const EntrySlot: React.FC<EntrySlotProps> = ({ id, item, label, sectionKey, position, onOpen, onDrop }) => {
  const triggerRef = useTakesFocus(id, false);
  const { dropAreaProps } = useDropTarget<{ index: number }>({
    acceptedTypes: [ENTRY_DRAG_TYPE],
    onItemsDropped: async () => onDrop({ sectionKey, group: dropGroup(item), position }),
  });
  const renderName = (formatted: string) => (
    <button ref={triggerRef} type="button" className={editStyles.target} aria-label={`Edit ${label}`} aria-expanded={false} onClick={() => onOpen(id)}>
      {formatted}
    </button>
  );

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
      {item.kind === "spellcasting"
        ? <SpellcastingEntry spellcasting={item.value} renderName={renderName} />
        : <TextEntry name={item.value.name} description={item.value.description} renderName={renderName} />}
    </div>
  );
};

const AddButton: React.FC<{ id: string; label: string; onClick: () => void }> = ({ id, label, onClick }) => {
  const ref = useTakesFocus(id, false);
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
  const triggerRef = useTakesFocus(ADD_SECTION_ID, false);
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
