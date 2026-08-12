import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MdContentCopy, MdDelete, MdEdit, MdPersonAdd, MdVisibility, MdVisibilityOff } from "react-icons/md";
import type { Item, ItemSummary } from "shared/domain/dnd5e/item.js";
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
import { ActionMenu, type ActionMenuItem } from "../ActionMenu/ActionMenu.js";
import { BrowserLayout, useBrowserDetail, type BrowserDetail } from "../browser/BrowserLayout.js";
import { BrowserList } from "../browser/BrowserList.js";
import { GiveItemDialog } from "./GiveItemDialog.js";
import { ItemCard } from "./ItemCard.js";
import { EMPTY_ITEM_FILTERS, ItemFilters, type ItemFilterState } from "./ItemFilters.js";
import { ItemForm } from "./ItemForm/ItemForm.js";
import type { ItemFormMode } from "./ItemForm/itemFormModel.js";
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
};

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
export const ItemBrowser: React.FC<ItemBrowserProps> = ({ viewer, isActive, selectedId, onSelect }) => {
  const [filters, setFilters] = useState<ItemFilterState>(EMPTY_ITEM_FILTERS);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(filters.search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const detailState = useBrowserDetail({ selectedId });
  const viewerMounted = useRef(false);
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
  return (
    <ItemCatalog
      selectedId={selectedId}
      onSelect={onSelect}
      filters={filters}
      setFilters={setFilters}
      indexFilters={toIndexFilters(filters, query)}
      detailState={detailState}
      mutationScope={{ viewer, isCurrent: () => viewerMounted.current }}
    />
  );
};

type ItemCatalogProps = Pick<ItemBrowserProps, "selectedId" | "onSelect"> & {
  filters: ItemFilterState;
  setFilters: (filters: ItemFilterState) => void;
  indexFilters: ItemIndexFilters;
  detailState: BrowserDetail;
  mutationScope: ItemMutationScope;
};

type ItemOverlay = ItemFormMode | { kind: "delete"; item: Item } | { kind: "give"; item: Item };

const ItemCatalog: React.FC<ItemCatalogProps> = ({
  selectedId, onSelect, filters, setFilters, indexFilters, detailState, mutationScope,
}) => {
  const { viewer } = mutationScope;
  const { isGm } = viewer;
  const index = useItemIndex(viewer, indexFilters);
  const { data: selected } = useItem(viewer, selectedId);
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
    <button type="button" className={browserStyles.primaryButton} onClick={() => setOverlay({ kind: "create" })}>
      New item
    </button>
  );

  return (
    <>
      <BrowserLayout
        detailState={detailState}
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
                    Import them on the server with <code>npm run import:dnd5etools:items</code>.
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
        detail={
          <ItemDetail
            mutationScope={mutationScope}
            selectedId={selectedId}
            onSelect={onSelect}
            actions={isGm ? {
              onEdit: item => setOverlay({ kind: "edit", item }),
              onDuplicate: item => setOverlay({ kind: "duplicate", item }),
              onDelete: item => setOverlay({ kind: "delete", item }),
              onGive: item => setOverlay({ kind: "give", item }),
            } : undefined}
          />
        }
        detailLabel="Item details"
        dialogTitle={selected?.name ?? "Item"}
        // Authoring takes over the narrow reader's dialog until the form or confirmation closes.
        hasSelection={selectedId !== null && overlay === null}
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
      ) : overlay && (
        <Dialog
          isOpen
          onClose={closeOverlay}
          title={overlay.kind === "create" ? "New item"
            : `${overlay.kind === "edit" ? "Edit" : "Duplicate"} ${overlay.item.name}`}
          className="entity-form-dialog"
        >
          <ItemForm
            mode={overlay}
            mutationScope={mutationScope}
            onCancel={closeOverlay}
            onSaved={saved => {
              closeOverlay();
              if (detailState.isNarrow) detailState.open();
              onSelect(saved.id);
            }}
          />
        </Dialog>
      )}
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
};

// Loaded by ID, not from the list: a link or a member may name an item the current page does not show.
const ItemDetail: React.FC<ItemDetailProps> = ({ mutationScope, selectedId, onSelect, actions }) => {
  const { viewer } = mutationScope;
  const { data: item, error, isLoading } = useItem(viewer, selectedId);
  const visibility = useSetItemVisibility(mutationScope);

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
    item.gm?.hidden
      ? { label: "Show to players", icon: <MdVisibility />, onSelect: () => visibility.mutate({ id: item.id, hidden: false }) }
      : { label: "Hide from players", icon: <MdVisibilityOff />, onSelect: () => visibility.mutate({ id: item.id, hidden: true }) },
    { label: "Delete…", icon: <MdDelete />, onSelect: () => actions.onDelete(item) },
  ] : [];

  return (
    <ItemCard
      item={item}
      viewer={viewer}
      onSelect={onSelect}
      headerAction={actions ? <ActionMenu label={`Actions for ${item.name}`} items={menuItems} /> : undefined}
      notice={visibility.error && visibility.variables?.id === item.id
        ? <p className={browserStyles.statusError} role="alert">{visibility.error.message}</p>
        : undefined}
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
