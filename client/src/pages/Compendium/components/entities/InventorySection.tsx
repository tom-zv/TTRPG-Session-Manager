import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MdAdd } from "react-icons/md";
import type { ItemSummary } from "shared/domain/dnd5e/item.js";
import type {
  DnD5eInventory,
  DnD5eInventoryEntry,
  DnD5eInventoryItem,
  DnD5eInventoryItemLink,
} from "shared/domain/encounters/dnd5e/inventory.js";
import { InventoryConflictError } from "../../api/inventoryApi.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import { useInventory, useSaveInventory } from "../../api/query/useInventoryQueries.js";
import { compendiumLinkSearch } from "../../hooks/useCompendiumUrl.js";
import { ItemPicker } from "../items/ItemPicker.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Entities.module.css";

type InventorySectionProps = {
  entityId: number;
  /** The signed-in viewer (account and role); the cache is theirs, and writes land only while they still are. */
  scope: ItemMutationScope;
  /** GMs edit; players read. The server enforces the same rule. */
  canEdit: boolean;
};

type DraftRow = {
  key: number;
  name: string;
  quantity: string;
  notes: string;
  itemId?: number;
  /** What the editor shows for the link; absent for a deleted item. Never sent. */
  item?: DnD5eInventoryItemLink;
};

const BLANK_ROW = { name: "", quantity: "1", notes: "" } as const;
const isBlank = (row: DraftRow | undefined) =>
  row !== undefined && row.itemId === undefined && row.name.trim() === "" && row.notes.trim() === "";

const toDraftRow = (entry: DnD5eInventoryEntry, key: number): DraftRow => ({
  key,
  name: entry.name,
  quantity: String(entry.quantity),
  notes: entry.notes ?? "",
  ...(entry.itemId !== undefined ? { itemId: entry.itemId } : {}),
  ...(entry.item ? { item: entry.item } : {}),
});

const linkFromSummary = (item: ItemSummary): DnD5eInventoryItemLink => ({
  name: item.name,
  source: item.source,
  ...(item.gm && (item.gm.hidden || item.gm.hiddenByFamily) ? { hidden: true as const } : {}),
});

/**
 * A PC's or featured NPC's inventory on their sheet: a manual, ordered list of what they carry.
 * Collapsed by default and loaded the first time it opens. A row may link a catalog item: while the
 * viewer can see it, the row shows the item's current name and links to its page; otherwise the
 * saved name. GMs edit from a quiet "Add item" row at the end of the list, which opens the editor
 * on every item with a blank row ready. Render it only for an eligible template; the server
 * answers 404 for anything else.
 */
export const InventorySection: React.FC<InventorySectionProps> = ({ entityId, scope, canEdit }) => {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const { data: inventory, error, isLoading } = useInventory(scope.viewer, entityId, { enabled: open });
  const [editing, setEditing] = useState(false);
  // Bumped to restart the editor from the latest saved list.
  const [editorRun, setEditorRun] = useState(0);

  let body: React.ReactNode;
  if (isLoading) body = <p className={styles.inventoryStatus}>Loading the inventory…</p>;
  else if (error) body = <p className={`${styles.inventoryStatus} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  // Eligibility changed since the sheet loaded, or access was revoked.
  else if (!inventory) body = <p className={styles.inventoryStatus}>No inventory is available.</p>;
  else if (editing) {
    body = (
      <InventoryEditor
        // A fresh draft from the saved list each time the editor opens or reloads.
        key={`${entityId}-${editorRun}`}
        entityId={entityId}
        scope={scope}
        inventory={inventory}
        onDone={() => setEditing(false)}
        onReload={() => setEditorRun(run => run + 1)}
      />
    );
  } else {
    body = (
      <>
        <InventoryList items={inventory.items} canEdit={canEdit} />
        {canEdit && (
          <button type="button" className={styles.inventoryAdd} onClick={() => setEditing(true)}>
            <MdAdd aria-hidden="true" />
            Add item
          </button>
        )}
      </>
    );
  }

  return (
    <section className={styles.inventory} aria-labelledby={headingId}>
      <details className={styles.sheetMore} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary id={headingId}>Inventory</summary>
        {/* Rendered only while open, like Traits and actions. */}
        {open && <div className={styles.inventoryBody}>{body}</div>}
      </details>
    </section>
  );
};

/** A link to an item's Compendium page that keeps the rest of the URL. */
const ItemPageLink: React.FC<{ itemId: number; children: React.ReactNode }> = ({ itemId, children }) => {
  const [params] = useSearchParams();
  return <Link to={{ search: compendiumLinkSearch(params, "items", itemId) }}>{children}</Link>;
};

const InventoryLabel: React.FC<{ entry: DnD5eInventoryEntry; canEdit: boolean }> = ({ entry, canEdit }) => {
  if (entry.itemId !== undefined && entry.item) {
    return (
      <>
        <ItemPageLink itemId={entry.itemId}>{entry.item.name}</ItemPageLink>
        {entry.item.name !== entry.name && <span className={styles.inventoryNote}>Saved as “{entry.name}”</span>}
        {entry.item.hidden && <span className={styles.inventoryBadge}>Hidden from players</span>}
      </>
    );
  }
  return (
    <>
      {entry.name}
      {/* Only a GM learns that a link exists; the catalog item was deleted. */}
      {canEdit && entry.itemId !== undefined && <span className={styles.inventoryNote}>Catalog item deleted</span>}
    </>
  );
};

const InventoryList: React.FC<{ items: DnD5eInventoryEntry[]; canEdit: boolean }> = ({ items, canEdit }) => {
  if (items.length === 0) return <p className={styles.inventoryStatus}>Nothing in the inventory yet.</p>;
  return (
    <table className={styles.inventoryTable}>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Qty</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          // Names may repeat, so the position is part of the key.
          <tr key={`${index}-${item.name}`}>
            <th scope="row"><InventoryLabel entry={item} canEdit={canEdit} /></th>
            <td className={styles.inventoryQuantity}>{item.quantity}</td>
            <td>{item.notes ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

type InventoryEditorProps = {
  entityId: number;
  scope: ItemMutationScope;
  inventory: DnD5eInventory;
  onDone: () => void;
  /** Discard the draft and start again from the latest saved list. */
  onReload: () => void;
};

// Which row the catalog picker is choosing for; "new" adds a row from the catalog.
type Picking = number | "new" | null;

const InventoryEditor: React.FC<InventoryEditorProps> = ({ entityId, scope, inventory, onDone, onReload }) => {
  const { items } = inventory;
  // Opened from "Add item": the saved items, then a blank row with the cursor in it.
  const nextKey = useRef(items.length + 1);
  const [rows, setRows] = useState<DraftRow[]>(() => [
    ...items.map(toDraftRow),
    { key: items.length, ...BLANK_ROW },
  ]);
  // The revision this draft was made from; the server refuses the save if the list has moved on.
  const [baseRevision, setBaseRevision] = useState(inventory.revision);
  const [picking, setPicking] = useState<Picking>(null);
  // The button that opened the picker gets the focus back when it closes, so the keyboard stays in the row.
  const pickerOpener = useRef<HTMLButtonElement | null>(null);
  const openPicker = (target: Picking, opener: HTMLButtonElement) => {
    pickerOpener.current = opener;
    setPicking(target);
  };
  const closePicker = () => {
    setPicking(null);
    pickerOpener.current?.focus();
  };
  const firstBlankName = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstBlankName.current?.focus();
  }, []);
  const save = useSaveInventory(scope, entityId);
  const conflict = save.error instanceof InventoryConflictError ? save.error : null;

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => setRows(current => [...current, { key: nextKey.current++, ...BLANK_ROW }]);
  const removeRow = (key: number) => setRows(current => current.filter(row => row.key !== key));
  const detach = (key: number) =>
    setRows(current => current.map(row => (row.key === key ? { key: row.key, name: row.name, quantity: row.quantity, notes: row.notes } : row)));

  const pick = (item: ItemSummary) => {
    const link = { itemId: item.id, item: linkFromSummary(item) };
    if (picking === "new") {
      // Fill the trailing blank row if there is one, so the new item sits where Add item would put it.
      setRows(current => {
        const last = current[current.length - 1];
        const row = { name: item.name, quantity: "1", notes: "", ...link };
        return isBlank(last)
          ? [...current.slice(0, -1), { ...row, key: last.key }]
          : [...current, { ...row, key: nextKey.current++ }];
      });
    } else if (picking !== null) {
      // The saved name stays as the row's label; a blank one takes the item's name.
      setRows(current => current.map(row => (row.key === picking
        ? { ...row, ...link, name: row.name.trim() === "" ? item.name : row.name }
        : row)));
    }
    closePicker();
  };

  const draft = (): DnD5eInventoryItem[] => {
    // Blank rows at the end (the one "Add item" opened with, or extras) are not items. Blank rows
    // between items are sent, so the server's "Item n" still matches the editor's numbering.
    let end = rows.length;
    while (end > 0 && isBlank(rows[end - 1])) end--;
    return rows.slice(0, end).map(row => ({
      name: row.name,
      quantity: Number(row.quantity),
      ...(row.notes.trim() ? { notes: row.notes } : {}),
      ...(row.itemId !== undefined ? { itemId: row.itemId } : {}),
    }));
  };
  const submit = (expectedRevision: number) => {
    // The server validates and trims; a rejected list stays in the editor with its message.
    save.mutate({ items: draft(), expectedRevision }, { onSuccess: onDone });
  };

  return (
    // noValidate: the server's message is the one shown for every rejected list, in the editor.
    <form
      className={styles.inventoryEditor}
      onSubmit={event => {
        event.preventDefault();
        submit(baseRevision);
      }}
      aria-label="Edit inventory"
      noValidate
    >
      {rows.length === 0 && <p className={styles.inventoryStatus}>No items. Add one, or save an empty inventory.</p>}
      {rows.map((row, index) => {
        const label = `Item ${index + 1}`;
        const lower = label.toLowerCase();
        return (
          <fieldset key={row.key} className={styles.inventoryRow}>
            <legend className={styles.visuallyHidden}>{label}</legend>
            <input
              ref={row.key === items.length ? firstBlankName : undefined}
              aria-label={`${label} name`}
              placeholder="Item"
              value={row.name}
              onChange={event => update(row.key, { name: event.target.value })}
            />
            <input
              aria-label={`${label} quantity`}
              type="number"
              min={1}
              step={1}
              value={row.quantity}
              onChange={event => update(row.key, { quantity: event.target.value })}
            />
            <input
              aria-label={`${label} notes`}
              placeholder="Notes"
              value={row.notes}
              onChange={event => update(row.key, { notes: event.target.value })}
            />
            <button type="button" className={browserStyles.secondaryButton} aria-label={`Remove ${lower}`} onClick={() => removeRow(row.key)}>
              Remove
            </button>
            <div className={styles.inventoryRowLink}>
              {row.itemId !== undefined && (
                <span>
                  {row.item ? `Linked to ${row.item.name} (${row.item.source})` : "Linked to a deleted catalog item"}
                  {row.item?.hidden && " · Hidden from players"}
                </span>
              )}
              <button
                type="button"
                className={styles.inventoryLinkButton}
                aria-label={row.itemId === undefined ? `Link ${lower} to a catalog item` : `Change the link for ${lower}`}
                aria-expanded={picking === row.key}
                onClick={event => openPicker(row.key, event.currentTarget)}
              >
                {row.itemId === undefined ? "Link item" : "Change link"}
              </button>
              {row.itemId !== undefined && (
                <button type="button" className={styles.inventoryLinkButton} aria-label={`Detach ${lower} from its catalog item`} onClick={() => detach(row.key)}>
                  Detach
                </button>
              )}
            </div>
            {picking === row.key && (
              <ItemPicker
                viewer={scope.viewer}
                label={`Choose a catalog item for ${lower}`}
                onPick={pick}
                onCancel={closePicker}
              />
            )}
          </fieldset>
        );
      })}
      {picking === "new" && (
        <ItemPicker viewer={scope.viewer} label="Add an item from the catalog" onPick={pick} onCancel={closePicker} />
      )}
      {conflict ? (
        <div className={styles.inventoryConflict} role="alert">
          <p>Someone changed this inventory after you opened it. Your changes are still here and have not been saved.</p>
          <div className={browserStyles.actionRow}>
            <button type="button" className={browserStyles.secondaryButton} onClick={onReload}>Discard mine and load theirs</button>
            <button
              type="button"
              className={browserStyles.primaryButton}
              disabled={save.isPending}
              onClick={() => {
                setBaseRevision(conflict.current.revision);
                submit(conflict.current.revision);
              }}
            >
              Save mine over theirs
            </button>
          </div>
        </div>
      ) : save.error && <p className={browserStyles.statusError} role="alert">{save.error.message}</p>}
      <div className={styles.inventoryActions}>
        <span className={styles.inventoryActionsEnd}>
          <button type="button" className={browserStyles.secondaryButton} onClick={addRow}>Add item</button>
          <button type="button" className={browserStyles.secondaryButton} aria-expanded={picking === "new"} onClick={event => openPicker("new", event.currentTarget)}>
            Add from catalog
          </button>
        </span>
        <span className={styles.inventoryActionsEnd}>
          <button type="button" className={browserStyles.secondaryButton} onClick={onDone} disabled={save.isPending}>Cancel</button>
          <button type="submit" className={browserStyles.primaryButton} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </span>
      </div>
    </form>
  );
};
