import type {
  DnD5eEntityDetails,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
} from "shared/domain/encounters/dnd5e/entity.js";
import { isSpellcastingDisplay } from "shared/domain/encounters/dnd5e/entity.js";
import {
  buildEntitySections,
  getSectionTitle,
  SECTION_ORDER,
  type EntryOrigin,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import type { EntityDraft } from "./defaults.js";
import type { SpellcastingModes } from "./inference.js";

/** One entry of a section, holding the row it is stored as, and where it was read from. */
export type LayoutItem = (
  | { kind: "trait"; value: EntityTrait }
  | { kind: "action"; value: EntityAction }
  // A block's save DC and attack modes travel with it, so a move keeps them.
  | { kind: "spellcasting"; value: EntitySpellcasting; modes: SpellcastingModes }
) & { origin?: EntryOrigin };

/** The sections as the sheet shows them: text entries first, then spellcasting blocks. */
export type LayoutSection = { key: string; title: string; items: LayoutItem[] };

/** Where an item sits in the layout. */
export type LayoutAt = { section: number; item: number };

type EntryList = EntryOrigin["list"];
type EntryLists = Pick<EntityDraft, EntryList>;
type EntityEntries = Pick<DnD5eEntityDetails, EntryList>;

/** What an entry edit writes: the lists it changed, and the blocks' modes when spellcasting changed. */
export type LayoutWrite = {
  patch: Partial<EntryLists>;
  modes?: { spellcasting: SpellcastingModes[] };
  /** The id of the saved item after the edit. */
  tracked?: string;
  /** The new id of every entry whose id changed (null: removed). Entries not listed keep theirs. */
  moved: Map<string, string | null>;
};

/** The validator path of an entry, which is also its editor's id: `actions.3`. */
export const entryId = ({ list, index }: EntryOrigin): string => `${list}.${index}`;

const isText = (item: LayoutItem): boolean => item.kind !== "spellcasting";
const listOf = (item: LayoutItem): EntryList => (item.kind === "trait" ? "traits" : item.kind === "action" ? "actions" : "spellcasting");

/** The sheet's sections of a draft, in the order `buildEntitySections` shows them. */
export const readLayout = (entity: DnD5eEntityDetails, modes: readonly SpellcastingModes[]): LayoutSection[] =>
  buildEntitySections(entity).map(section => ({
    key: section.key,
    title: section.title,
    items: section.entries.map((entry): LayoutItem => {
      const origin = entry.source;
      if (origin.list === "traits") return { kind: "trait", value: entity.traits![origin.index], origin };
      if (origin.list === "actions") return { kind: "action", value: entity.actions![origin.index], origin };
      const blockModes = modes[origin.index] ?? { saveDc: "manual", spellAttackBonus: "manual" };
      return { kind: "spellcasting", value: entity.spellcasting![origin.index], modes: blockModes, origin };
    }),
  }));

/**
 * A content edit: the item's row replaced where it is stored. Every other row, and every other
 * list, keeps its place and `sortOrder`.
 */
export const writeItem = (
  original: EntityEntries,
  modes: readonly SpellcastingModes[],
  item: LayoutItem & { origin: EntryOrigin },
): LayoutWrite => {
  const { index } = item.origin;
  const tracked = entryId(item.origin);
  if (item.kind === "spellcasting") {
    const blocks = [...(original.spellcasting ?? [])];
    blocks[index] = item.value;
    const blockModes = [...modes];
    blockModes[index] = item.modes;
    return { patch: { spellcasting: blocks }, modes: { spellcasting: blockModes }, tracked, moved: new Map() };
  }
  if (item.kind === "trait") {
    const traits = [...(original.traits ?? [])];
    traits[index] = item.value;
    return { patch: { traits }, tracked, moved: new Map() };
  }
  const actions = [...(original.actions ?? [])];
  actions[index] = item.value;
  return { patch: { actions }, tracked, moved: new Map() };
};

/**
 * A structural edit (add, remove, move): each list in `lists` is written in sheet order, with
 * `sortOrder` set to the position, so the saved order is the order the GM sees. Lists the edit did
 * not touch are left out. `track` is the saved item, and `trackedFrom` the id it had before.
 */
export const writeLayout = (
  before: readonly LayoutSection[],
  layout: readonly LayoutSection[],
  lists: ReadonlySet<EntryList>,
  track?: LayoutItem,
  trackedFrom?: string,
): LayoutWrite => {
  const written: Record<EntryList, LayoutItem[]> = { traits: [], actions: [], spellcasting: [] };
  for (const section of layout) {
    for (const item of section.items) written[listOf(item)].push(item);
  }

  const patch: Partial<EntryLists> = {};
  let modes: LayoutWrite["modes"];
  if (lists.has("traits")) {
    patch.traits = written.traits.map((item, sortOrder) => ({ ...(item.value as EntityTrait), sortOrder }));
  }
  if (lists.has("actions")) {
    patch.actions = written.actions.map((item, sortOrder) => ({ ...(item.value as EntityAction), sortOrder }));
  }
  if (lists.has("spellcasting")) {
    const blocks = written.spellcasting.filter((item): item is Extract<LayoutItem, { kind: "spellcasting" }> => item.kind === "spellcasting");
    patch.spellcasting = blocks.map(item => item.value);
    modes = { spellcasting: blocks.map(item => item.modes) };
  }

  const where = (item: LayoutItem): string | null => {
    const index = written[listOf(item)].indexOf(item);
    return index >= 0 ? entryId({ list: listOf(item), index }) : null;
  };
  const tracked = track ? where(track) ?? undefined : undefined;
  const moved = new Map<string, string | null>();
  for (const item of before.flatMap(section => section.items)) {
    if (!item.origin || !lists.has(item.origin.list)) continue;
    const from = entryId(item.origin);
    const to = from === trackedFrom ? tracked ?? null : where(item);
    if (to !== from) moved.set(from, to);
  }
  return { patch, modes, tracked, moved };
};

const withItems = (layout: readonly LayoutSection[], section: number, items: LayoutItem[]): LayoutSection[] =>
  layout.map((existing, index) => (index === section ? { ...existing, items } : existing));

/** Puts an item at the end of its group (text or spellcasting) in a section, creating the section if needed. */
export const insertItem = (layout: readonly LayoutSection[], sectionKey: string, item: LayoutItem): LayoutSection[] => {
  const section = layout.findIndex(candidate => candidate.key === sectionKey);
  if (section < 0) {
    // A new section takes its place in sheet order, so its entry is written where the GM sees it.
    const shell = { key: sectionKey, title: getSectionTitle(sectionKey), items: [item] };
    const before = layout.findIndex(existing => compareSections(sectionKey, existing.key) < 0);
    return before < 0 ? [...layout, shell] : [...layout.slice(0, before), shell, ...layout.slice(before)];
  }
  const items = [...layout[section].items];
  const firstSpellcasting = items.findIndex(existing => !isText(existing));
  if (isText(item) && firstSpellcasting >= 0) items.splice(firstSpellcasting, 0, item);
  else items.push(item);
  return withItems(layout, section, items);
};

/** Where an item object sits, or null. */
export const locateItem = (layout: readonly LayoutSection[], item: LayoutItem): LayoutAt | null => {
  for (const [section, candidate] of layout.entries()) {
    const index = candidate.items.indexOf(item);
    if (index >= 0) return { section, item: index };
  }
  return null;
};

export const replaceItem = (layout: readonly LayoutSection[], at: LayoutAt, item: LayoutItem): LayoutSection[] =>
  withItems(layout, at.section, layout[at.section].items.map((existing, index) => (index === at.item ? item : existing)));

export const removeItem = (layout: readonly LayoutSection[], at: LayoutAt): LayoutSection[] =>
  withItems(layout, at.section, layout[at.section].items.filter((_, index) => index !== at.item));

/**
 * Moves an item to another position in its section, among entries of its own group: text entries
 * and spellcasting blocks do not mix, since the sheet always lists the blocks last. Returns null
 * when it cannot move there.
 */
export const moveItem = (layout: readonly LayoutSection[], at: LayoutAt, to: number): LayoutSection[] | null => {
  const items = [...layout[at.section].items];
  const item = items[at.item];
  if (to === at.item || to < 0 || to >= items.length || isText(items[to]) !== isText(item)) return null;
  items.splice(at.item, 1);
  items.splice(to, 0, item);
  return withItems(layout, at.section, items);
};

/**
 * The item as it is stored in another section: a trait or an action becomes the other when it
 * moves to or from Traits, an action takes the section as its type, and a spellcasting block
 * changes where it is displayed.
 */
export const itemForSection = (item: LayoutItem, sectionKey: string, actionType = sectionKey): LayoutItem => {
  if (item.kind === "spellcasting") {
    const value = { ...item.value };
    delete value.displayAs;
    return { kind: "spellcasting", value: isSpellcastingDisplay(sectionKey) ? { ...value, displayAs: sectionKey } : value, modes: item.modes };
  }
  const { name, description } = item.value;
  return sectionKey === "trait"
    ? { kind: "trait", value: { name, description } }
    : { kind: "action", value: { name, description, actionType } };
};

/** The sections an item may move to: every standard section, and the custom ones already in use. */
export const sectionChoices = (layout: readonly LayoutSection[], kind: LayoutItem["kind"]): { key: string; title: string }[] => {
  if (kind === "spellcasting") {
    return ["spellcasting", "trait", "action", "bonus action", "reaction", "legendary"].map(key => ({ key, title: getSectionTitle(key) }));
  }
  const keys = [
    ...SECTION_ORDER.filter(key => key !== "spellcasting"),
    ...layout.map(section => section.key).filter(key => !SECTION_ORDER.includes(key)),
  ];
  return keys.map(key => ({ key, title: getSectionTitle(key) }));
};

/** Sheet order of section keys: the standard order, then custom sections as they appear. */
export const compareSections = (left: string, right: string): number => {
  const rank = (key: string) => {
    const index = SECTION_ORDER.indexOf(key);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };
  return rank(left) - rank(right);
};
