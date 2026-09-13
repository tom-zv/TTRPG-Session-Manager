import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MdContentCopy, MdDelete, MdEdit, MdPersonAdd, MdVisibility, MdVisibilityOff } from "react-icons/md";
import { HOMEBREW_ITEM_SOURCE, type Item, type ItemDetails, type ItemSummary } from "shared/domain/dnd5e/item.js";
import Dialog from "src/components/Dialog/Dialog.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import { ITEM_KEYS, type ItemViewer } from "../../api/query/itemKeys.js";
import {
  useDeleteItem,
  useItem,
  useItemIndex,
  useSetItemVisibility,
  type ItemIndexFilters,
} from "../../api/query/useItemQueries.js";
import type { EditLocation } from "../../hooks/useCompendiumUrl.js";
import { ActionMenu, type ActionMenuItem } from "../ActionMenu/ActionMenu.js";
import { BrowserLayout, useBrowserDetail, type BrowserDetail } from "../browser/BrowserLayout.js";
import { BrowserList } from "../browser/BrowserList.js";
import { GiveItemDialog } from "./GiveItemDialog.js";
import { ItemCard } from "./ItemCard.js";
import { EMPTY_ITEM_FILTERS, ItemFilters, type ItemFilterState } from "./ItemFilters.js";
import { UnsavedBar, isWorthKeeping, useUnloadWarning } from "../sheetEditor/DraftSlot.js";
import { createEditorBuffer, type EditorBuffer } from "../sheetEditor/SheetEditContext.js";
import {
  ItemEditor,
  createItemDraftState,
  type ItemDraftState,
  type ItemEditorHandle,
  type ItemSaveProgress,
} from "./editor/ItemEditor.js";
import { blankItemDraft, itemToDraft } from "./editor/model/itemDraft.js";
import { KIND_LABELS, capitalize, formatItemLink } from "./itemFormat.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Items.module.css";

type ItemBrowserProps = {
  /** The signed-in viewer; every item query is scoped to them. */
  viewer: ItemViewer;
  /** Keep filters and reader state while the page or tab is hidden. */
  isActive: boolean;
  /** The Compendium owns the selection and its URL (?item=<id>). */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** The item in edit mode, from the URL (?item=<id>&edit=1, ?item=new&from=<id>); GMs only. */
  editing: EditLocation | null;
  /** Open edit mode as a new history entry. */
  onEdit: (edit: EditLocation) => void;
  /** Leave edit mode, selecting the saved item, keeping the selection (undefined) or clearing it (null). */
  onEditEnd: (selected?: number | null) => void;
};

/**
 * The one draft the browser keeps: it survives moving to another item (the unsaved bar offers it
 * back), the reader remounting and the tab being hidden. `serial` remounts the editor per draft.
 */
type ItemDraftSlot = {
  serial: number;
  edit: EditLocation;
  /** The stored item under the draft, or a homebrew shell (id 0) for a new one. */
  record: Item;
  state: ItemDraftState;
  save: ItemSaveProgress;
  /** The stored charges, which unchanged text keeps exactly. */
  originalCharges: ItemDetails["charges"];
  buffer: EditorBuffer;
};

const sameEdit = (left: EditLocation, right: EditLocation) =>
  left.target === right.target && (left.target !== "new" || left.from === right.from);

/** The page of an item that is not saved yet: a concrete homebrew item, as every new item is. */
const newItemShell = (): Item => ({
  id: 0,
  kind: "concrete",
  origin: "homebrew",
  name: "",
  source: HOMEBREW_ITEM_SOURCE,
  rarity: "uncommon",
  requiresAttunement: false,
  aliases: [],
  details: {},
});

const slotName = (slot: ItemDraftSlot) => slot.state.draft.name.trim() || (slot.edit.target === "new" ? "a new item" : slot.record.name);

/** Wait this long after typing before searching the server. */
const SEARCH_DELAY_MS = 250;

function toIndexFilters(filters: ItemFilterState, query: string): ItemIndexFilters {
  const params: ItemIndexFilters = {};
  if (query) params.q = query;
  if (filters.kind) params.kinds = [filters.kind];
  if (filters.category) params.categories = [filters.category];
  if (filters.rarity) params.rarities = [filters.rarity];
  if (filters.source) params.sources = [filters.source];
  if (filters.origin) params.origins = [filters.origin];
  if (filters.attunement) params.attunement = true;
  // Unset, the server lists specifics only for a search: browsing shows families instead.
  if (filters.specifics) params.specifics = true;
  return params;
}

const itemId = (item: ItemSummary) => item.id;

const renderItemRow = (item: ItemSummary) => (
  <>
    <span className={browserStyles.rowName}>
      {item.name}
      {item.kind !== "concrete" && <span className={styles.badge}>{KIND_LABELS[item.kind]}</span>}
      {item.origin === "homebrew" && <span className={styles.badge}>Homebrew</span>}
      {item.gm && (item.gm.hidden || item.gm.hiddenByFamily) && <span className={styles.hiddenBadge}>Hidden</span>}
    </span>
    <span className={browserStyles.rowMeta}>
      <span>{item.source}</span>
      {item.category && <span>{capitalize(item.category)}</span>}
      {item.rarity !== "none" && <span>{capitalize(item.rarity)}</span>}
      {/* A specific names its exact base printing, so two printings never look alike. */}
      {item.family && item.base && <span>{formatItemLink(item.base)}</span>}
    </span>
  </>
);

/**
 * The item catalog. The server filters, sorts and pages the list; browsing shows named items,
 * base gear, groups and magic variants, and a search or the specifics filter adds the specific
 * items generated from variants. GMs also create, edit, duplicate, hide and delete items.
 */
export const ItemBrowser: React.FC<ItemBrowserProps> = ({ viewer, isActive, selectedId, onSelect, editing: requested, onEdit, onEditEnd }) => {
  const [filters, setFilters] = useState<ItemFilterState>(EMPTY_ITEM_FILTERS);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(filters.search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  // Only a GM edits; a player's edit URL reads as the item itself.
  const editing = viewer.isGm ? requested : null;
  const showingNew = editing?.target === "new";
  // The draft slot, created from the URL's edit location once its item has loaded, and kept while
  // it is worth keeping (also while the tab is hidden); otherwise dropped when edit mode ends.
  const [slot, setSlot] = useState<ItemDraftSlot | null>(null);
  const [serial, setSerial] = useState(0);
  const { data: editItem } = useItem(viewer, editing && editing.target !== "new" ? editing.target : null);
  const { data: fromItem, error: fromError } = useItem(viewer, showingNew ? editing.from : null);
  const slotShown = slot !== null && editing !== null && sameEdit(slot.edit, editing);
  if (!slotShown) {
    if (slot && !isWorthKeeping(slot)) {
      setSlot(null);
    } else if (!slot && editing) {
      // Families and groups are not duplicated: a new item is always concrete homebrew.
      const from = editing.target === "new" && fromItem?.kind === "concrete" ? fromItem : null;
      const record = editing.target === "new" ? (editing.from === null || from ? newItemShell() : null) : editItem ?? null;
      if (record) {
        setSerial(serial + 1);
        setSlot({
          serial,
          edit: editing,
          record,
          state: createItemDraftState(editing.target === "new"
            ? (from ? itemToDraft(from, { duplicate: true }) : blankItemDraft())
            : itemToDraft(record)),
          save: { pending: false, error: null },
          originalCharges: (from ?? (editing.target === "new" ? null : record))?.details.charges,
          buffer: createEditorBuffer(),
        });
      }
    }
  }
  const viewerMounted = useRef(false);
  const slotRef = useRef(slot);
  useEffect(() => {
    slotRef.current = slot;
  }, [slot]);
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useUnloadWarning(slot !== null, () => slotRef.current !== null && isWorthKeeping(slotRef.current));
  const updateDraft = useCallback((serial: number, state: ItemDraftState) =>
    setSlot(current => current?.serial === serial ? { ...current, state } : current), []);
  const updateSave = useCallback((serial: number, save: ItemSaveProgress) =>
    setSlot(current => current?.serial === serial ? { ...current, save } : current), []);
  const finishSave = useCallback((serial: number, saved: Item) => {
    const origin = slotRef.current;
    // A save that lands after this browser is gone (another account signed in) changes nothing here.
    if (!viewerMounted.current || !origin || origin.serial !== serial) return;
    setSlot(current => current?.serial === serial ? null : current);
    // After a create the URL names the new item, in place of ?item=new.
    if (editingRef.current && sameEdit(origin.edit, editingRef.current)) onEditEnd(saved.id);
  }, [onEditEnd]);
  const endEdit = (selected?: number | null) => {
    setSlot(null);
    onEditEnd(selected);
  };

  // On narrow screens the editor is always in the open reader; closing the reader ends edit mode.
  const detailState = useBrowserDetail({
    selectedId: showingNew ? `new:${editing.from ?? ""}` : selectedId,
    keepOpen: slotShown,
  });
  useLayoutEffect(() => {
    viewerMounted.current = true;
    return () => { viewerMounted.current = false; };
  }, []);

  const queryClient = useQueryClient();
  const { userId, isGm } = viewer;
  // Drop player reads when Items is left, so a deliberate return starts with current visibility.
  // Text references (links and their previews) belong to the documents that show them and are
  // read per visit; see ItemReferenceVisit.
  useLayoutEffect(() => {
    if (isActive || isGm) return;
    const references = ITEM_KEYS.references({ userId, isGm });
    queryClient.removeQueries({
      queryKey: ITEM_KEYS.viewer({ userId, isGm }),
      predicate: query => query.queryKey[references.length - 1] !== references.at(-1),
    });
  }, [isActive, isGm, queryClient, userId]);

  if (!isActive) return null;
  const mutationScope: ItemMutationScope = { viewer, isCurrent: () => viewerMounted.current };
  const draft: DraftProps = {
    editing,
    slot: slotShown ? slot : null,
    keptSlot: slot && !slotShown && isWorthKeeping(slot) ? slot : null,
    fromError,
    fromRefused: showingNew && fromItem !== undefined && fromItem !== null && fromItem.kind !== "concrete",
    onEdit,
    onEditEnd: endEdit,
    onLeave: onEditEnd,
    onDiscard: () => setSlot(null),
    onChange: updateDraft,
    onSaveProgress: updateSave,
    onSaved: finishSave,
  };
  return (
    <ItemCatalog
      selectedId={selectedId}
      onSelect={onSelect}
      filters={filters}
      setFilters={setFilters}
      indexFilters={toIndexFilters(filters, query)}
      detailState={detailState}
      mutationScope={mutationScope}
      draft={draft}
    />
  );
};

/** The draft slot as the catalog shows it: the editor, the unsaved bar, and how they report back. */
type DraftProps = {
  editing: EditLocation | null;
  /** The slot of the edit location the URL shows, or null. */
  slot: ItemDraftSlot | null;
  /** Another item's draft, kept aside: the unsaved bar offers it back. */
  keptSlot: ItemDraftSlot | null;
  fromError: Error | null;
  /** A duplicate of a family or group was asked for; only concrete items are duplicated. */
  fromRefused: boolean;
  onEdit: (edit: EditLocation) => void;
  /** Leave edit mode and drop the draft (Cancel, Discard). */
  onEditEnd: (selected?: number | null) => void;
  /**
   * Leave edit mode and keep the draft while it is worth keeping (changes, a save in flight, open
   * input): the unsaved bar offers it back, and a held save still settles against it.
   */
  onLeave: (selected?: number | null) => void;
  onDiscard: () => void;
  onChange: (serial: number, state: ItemDraftState) => void;
  onSaveProgress: (serial: number, save: ItemSaveProgress) => void;
  onSaved: (serial: number, saved: Item) => void;
};

type ItemCatalogProps = Pick<ItemBrowserProps, "selectedId" | "onSelect"> & {
  filters: ItemFilterState;
  setFilters: (filters: ItemFilterState) => void;
  indexFilters: ItemIndexFilters;
  detailState: BrowserDetail;
  mutationScope: ItemMutationScope;
  draft: DraftProps;
};

type ItemOverlay = { kind: "delete"; item: Item } | { kind: "give"; item: Item };

const ItemCatalog: React.FC<ItemCatalogProps> = ({
  selectedId, onSelect, filters, setFilters, indexFilters, detailState, mutationScope, draft,
}) => {
  const { viewer } = mutationScope;
  const { isGm } = viewer;
  const { editing, slot, keptSlot } = draft;
  const showingNew = editing?.target === "new";
  const index = useItemIndex(viewer, indexFilters);
  const { data: selected } = useItem(viewer, selectedId);
  // The stored item as it is now (a visibility change while editing), under the draft.
  const { data: liveRecord } = useItem(viewer, slot && slot.record.id > 0 ? slot.record.id : null);
  const editorRef = useRef<ItemEditorHandle>(null);
  const visibility = useSetItemVisibility(mutationScope);
  const searchRef = useRef<HTMLInputElement>(null);
  const [overlay, setOverlay] = useState<ItemOverlay | null>(null);
  const [seenSelectedId, setSeenSelectedId] = useState(selectedId);
  if (selectedId !== seenSelectedId) {
    setSeenSelectedId(selectedId);
    setOverlay(null);
  }

  const pages = index.data?.pages ?? [];
  const items = pages.flatMap(page => page.items);
  const first = pages[0];
  const total = first?.total ?? 0;
  const filtered = Object.keys(indexFilters).length > 0 || filters.search !== "";
  const emptyCatalog = index.isSuccess && !index.isPlaceholderData && total === 0 && !filtered;

  const closeOverlay = () => setOverlay(null);
  const newItemButton = isGm && (
    <button type="button" className={browserStyles.primaryButton} onClick={() => draft.onEdit({ target: "new", from: null })}>
      New item
    </button>
  );
  const visibilityNotice = (item: Item) => (visibility.error && visibility.variables?.id === item.id
    ? <p className={browserStyles.statusError} role="alert">{visibility.error.message}</p>
    : undefined);
  const visibilityAction = (item: Item): ActionMenuItem => (item.gm?.hidden
    ? { label: "Show to players", icon: <MdVisibility />, onSelect: () => visibility.mutate({ id: item.id, hidden: false }) }
    : { label: "Hide from players", icon: <MdVisibilityOff />, onSelect: () => visibility.mutate({ id: item.id, hidden: true }) });

  let detail: React.ReactNode;
  if (slot) {
    const record = liveRecord ?? slot.record;
    // Give and visibility are not part of the draft: they act on the stored item at once.
    const actions = record.id > 0 && (
      <ActionMenu
        label={`Actions for ${record.name}`}
        items={[
          ...(record.kind === "concrete"
            ? [{ label: "Give to character…", icon: <MdPersonAdd />, onSelect: () => setOverlay({ kind: "give", item: record }) }]
            : []),
          visibilityAction(record),
        ]}
      />
    );
    detail = (
      <ItemEditor
        ref={editorRef}
        key={slot.serial}
        record={record}
        state={slot.state}
        onChange={state => draft.onChange(slot.serial, state)}
        saveProgress={slot.save}
        onSaveProgress={progress => draft.onSaveProgress(slot.serial, progress)}
        buffer={slot.buffer}
        originalCharges={slot.originalCharges}
        mutationScope={mutationScope}
        actions={actions}
        notice={visibilityNotice(record)}
        onSelect={onSelect}
        onCancel={() => draft.onEditEnd()}
        onSaved={saved => draft.onSaved(slot.serial, saved)}
      />
    );
  } else if (editing && keptSlot) {
    // Another item's changes are kept aside; edit mode here starts once they are resumed or discarded.
    detail = (
      <>
        <p className={browserStyles.status}>
          Save or discard the unsaved changes to {slotName(keptSlot)} before {showingNew ? "starting another item" : "editing this one"}.
        </p>
        {!showingNew && <ItemDetail mutationScope={mutationScope} selectedId={selectedId} onSelect={onSelect} />}
      </>
    );
  } else if (showingNew) {
    detail = draft.fromError
      ? <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{draft.fromError.message}</p>
      : draft.fromRefused
        ? <p className={browserStyles.status}>Only concrete items can be duplicated.</p>
        : <p className={browserStyles.status}>Preparing a new item…</p>;
  } else {
    detail = (
      <ItemDetail
        mutationScope={mutationScope}
        selectedId={selectedId}
        onSelect={onSelect}
        visibilityAction={visibilityAction}
        visibilityNotice={visibilityNotice}
        actions={isGm ? {
          onEdit: item => draft.onEdit({ target: item.id, from: null }),
          onDuplicate: item => draft.onEdit({ target: "new", from: item.id }),
          onDelete: item => setOverlay({ kind: "delete", item }),
          onGive: item => setOverlay({ kind: "give", item }),
        } : undefined}
      />
    );
  }
  const unsavedBar = keptSlot && (
    <UnsavedBar name={slotName(keptSlot)} onResume={() => draft.onEdit(keptSlot.edit)} onDiscard={draft.onDiscard} />
  );

  return (
    <>
      <BrowserLayout
        // Closing the narrow reader leaves edit mode; a draft with changes stays in the unsaved bar.
        detailState={{
          ...detailState,
          close: () => {
            if (slot && editorRef.current?.settle() === false) return;
            if (editing) draft.onLeave(showingNew ? null : undefined);
            detailState.close();
          },
        }}
        toolbar={
          <ItemFilters
            filters={filters}
            onChange={setFilters}
            facets={first?.facets}
            searchRef={searchRef}
            resultLabel={first ? (items.length < total ? `${items.length} of ${total} items` : `${total} items`) : ""}
            actions={!emptyCatalog && newItemButton}
          />
        }
        list={
          <>
            {unsavedBar}
            {index.error && (
              <div className={browserStyles.status}>
                <p className={browserStyles.statusError} role="alert">{index.error.message}</p>
                <button type="button" className={browserStyles.secondaryButton} onClick={() => void index.refetch()}>
                  Retry items
                </button>
              </div>
            )}
            {index.isLoading && <p className={browserStyles.status}>Loading items…</p>}
            {emptyCatalog && (
              <div className={browserStyles.status}>
                <p>No items are in the catalog yet.</p>
                {isGm && (
                  <p className={browserStyles.hint}>
                    Import them on the server with <code>npm run import:5etools:items</code>.
                  </p>
                )}
                {newItemButton}
              </div>
            )}
            {index.isSuccess && !emptyCatalog && items.length === 0 && (
              <p className={browserStyles.status}>No items match.</p>
            )}
            {items.length > 0 && (
              <BrowserList
                items={items}
                getId={itemId}
                renderRow={renderItemRow}
                label="Items"
                idPrefix="item-option"
                selectedId={selectedId}
                onSelect={(id, via) => {
                  if (slot && editorRef.current?.settle() === false) return;
                  onSelect(id);
                  detailState.onRowSelected(id, via);
                }}
                onActivate={detailState.open}
              />
            )}
            {index.hasNextPage && (
              <div className={styles.loadMore}>
                <button
                  type="button"
                  className={browserStyles.secondaryButton}
                  disabled={index.isFetchingNextPage}
                  onClick={() => void index.fetchNextPage()}
                >
                  {index.isFetchingNextPage ? "Loading…" : "Load more items"}
                </button>
              </div>
            )}
          </>
        }
        detail={detail}
        detailLabel="Item details"
        dialogTitle={slot && showingNew ? "New item" : selected?.name ?? "Item"}
        // A give or delete confirmation takes over the narrow reader's dialog until it closes.
        hasSelection={(selectedId !== null || showingNew) && overlay === null}
      />
      {overlay?.kind === "give" ? (
        <GiveItemDialog item={overlay.item} scope={mutationScope} onClose={closeOverlay} />
      ) : overlay?.kind === "delete" ? (
        <DeleteItemDialog
          item={overlay.item}
          mutationScope={mutationScope}
          onClose={closeOverlay}
          onDeleted={() => {
            closeOverlay();
            detailState.close();
            onSelect(null);
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }}
        />
      ) : null}
    </>
  );
};

type ItemDetailActions = {
  onEdit: (item: Item) => void;
  onDuplicate: (item: Item) => void;
  onDelete: (item: Item) => void;
  /** Concrete items only: a family or group is given as one of its printings. */
  onGive: (item: Item) => void;
};

type ItemDetailProps = {
  mutationScope: ItemMutationScope;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** GM only. */
  actions?: ItemDetailActions;
  visibilityAction?: (item: Item) => ActionMenuItem;
  visibilityNotice?: (item: Item) => React.ReactNode;
};

// Loaded by ID, not from the list: a link or a member may name an item the current page does not show.
const ItemDetail: React.FC<ItemDetailProps> = ({ mutationScope, selectedId, onSelect, actions, visibilityAction, visibilityNotice }) => {
  const { viewer } = mutationScope;
  const { data: item, error, isLoading } = useItem(viewer, selectedId);

  if (selectedId === null) return <p className={browserStyles.status}>Select an item to read it.</p>;
  if (isLoading) return <p className={browserStyles.status}>Loading item…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  // Hidden, deleted and missing items all read the same.
  if (!item) return <p className={browserStyles.status}>That item is not available.</p>;

  const menuItems: ActionMenuItem[] = actions ? [
    { label: "Edit", icon: <MdEdit />, onSelect: () => actions.onEdit(item) },
    // Settled for this editor: new definitions are concrete homebrew; families and groups are not duplicated.
    ...(item.kind === "concrete"
      ? [
        { label: "Give to character…", icon: <MdPersonAdd />, onSelect: () => actions.onGive(item) },
        { label: "Duplicate as homebrew", icon: <MdContentCopy />, onSelect: () => actions.onDuplicate(item) },
      ]
      : []),
    ...(visibilityAction ? [visibilityAction(item)] : []),
    { label: "Delete…", icon: <MdDelete />, onSelect: () => actions.onDelete(item) },
  ] : [];

  return (
    <ItemCard
      item={item}
      viewer={viewer}
      onSelect={onSelect}
      headerAction={actions ? <ActionMenu label={`Actions for ${item.name}`} items={menuItems} /> : undefined}
      notice={visibilityNotice?.(item)}
    />
  );
};

const DeleteItemDialog: React.FC<{ item: Item; mutationScope: ItemMutationScope; onClose: () => void; onDeleted: () => void }> = ({
  item,
  mutationScope,
  onClose,
  onDeleted,
}) => {
  const deleteItem = useDeleteItem(mutationScope);
  return (
    <Dialog isOpen onClose={onClose} title={`Delete ${item.name}?`}>
      <div className={styles.confirm}>
        <p>
          {item.name} leaves the catalog for everyone. Inventories that list it keep their rows.
          {item.kind === "family" && " Its specific items leave the catalog with it."}
        </p>
        {deleteItem.error && <p className={browserStyles.statusError} role="alert">{deleteItem.error.message}</p>}
        <div className={browserStyles.actionRow}>
          <button type="button" className={browserStyles.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={browserStyles.dangerButton}
            disabled={deleteItem.isPending}
            onClick={() => deleteItem.mutate(item.id, { onSuccess: onDeleted })}
          >
            {deleteItem.isPending ? "Deleting…" : "Delete item"}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
