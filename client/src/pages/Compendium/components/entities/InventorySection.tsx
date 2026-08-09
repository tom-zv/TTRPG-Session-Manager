import React, { useEffect, useId, useRef, useState } from "react";
import { MdAdd } from "react-icons/md";
import type { DnD5eInventoryItem } from "shared/domain/encounters/dnd5e/inventory.js";
import { useInventory, useSaveInventory } from "../../api/query/useInventoryQueries.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Entities.module.css";

type InventorySectionProps = {
  entityId: number;
  /** The signed-in user; the cache is scoped to them. */
  viewerId: number;
  /** GMs edit; players read. The server enforces the same rule. */
  canEdit: boolean;
};

type DraftRow = { key: number; name: string; quantity: string; notes: string };

const BLANK_ROW = { name: "", quantity: "1", notes: "" } as const;
const isBlank = (row: DraftRow | undefined) => row !== undefined && row.name.trim() === "" && row.notes.trim() === "";

/**
 * A PC's or featured NPC's inventory on their sheet: a manual, ordered list of what they carry.
 * Collapsed by default and loaded the first time it opens. GMs edit from a quiet "Add item" row at
 * the end of the list, which opens the editor on every item with a blank row ready.
 * Render it only for an eligible template; the server answers 404 for anything else.
 */
export const InventorySection: React.FC<InventorySectionProps> = ({ entityId, viewerId, canEdit }) => {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const { data: items, error, isLoading } = useInventory(viewerId, entityId, { enabled: open });
  const [editing, setEditing] = useState(false);

  let body: React.ReactNode;
  if (isLoading) body = <p className={styles.inventoryStatus}>Loading the inventory…</p>;
  else if (error) body = <p className={`${styles.inventoryStatus} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  // Eligibility changed since the sheet loaded, or access was revoked.
  else if (!items) body = <p className={styles.inventoryStatus}>No inventory is available.</p>;
  else if (editing) {
    body = (
      <InventoryEditor
        // A fresh draft from the saved list each time the editor opens.
        key={entityId}
        entityId={entityId}
        viewerId={viewerId}
        items={items}
        onDone={() => setEditing(false)}
      />
    );
  } else {
    body = (
      <>
        <InventoryList items={items} />
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

const InventoryList: React.FC<{ items: DnD5eInventoryItem[] }> = ({ items }) => {
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
            <th scope="row">{item.name}</th>
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
  viewerId: number;
  items: DnD5eInventoryItem[];
  onDone: () => void;
};

const InventoryEditor: React.FC<InventoryEditorProps> = ({ entityId, viewerId, items, onDone }) => {
  // Opened from "Add item": the saved items, then a blank row with the cursor in it.
  const nextKey = useRef(items.length + 1);
  const [rows, setRows] = useState<DraftRow[]>(() => [
    ...items.map((item, index) => ({ key: index, name: item.name, quantity: String(item.quantity), notes: item.notes ?? "" })),
    { key: items.length, ...BLANK_ROW },
  ]);
  const firstBlankName = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstBlankName.current?.focus();
  }, []);
  const save = useSaveInventory(viewerId, entityId);

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => setRows(current => [...current, { key: nextKey.current++, ...BLANK_ROW }]);
  const removeRow = (key: number) => setRows(current => current.filter(row => row.key !== key));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // The server validates and trims; a rejected list stays in the editor with its message.
    // Blank rows at the end (the one "Add item" opened with, or extras) are not items. Blank rows
    // between items are sent, so the server's "Item n" still matches the editor's numbering.
    let end = rows.length;
    while (end > 0 && isBlank(rows[end - 1])) end--;
    const draft = rows.slice(0, end).map(row => ({
      name: row.name,
      quantity: Number(row.quantity),
      ...(row.notes.trim() ? { notes: row.notes } : {}),
    }));
    save.mutate(draft, { onSuccess: onDone });
  };

  return (
    // noValidate: the server's message is the one shown for every rejected list, in the editor.
    <form className={styles.inventoryEditor} onSubmit={submit} aria-label="Edit inventory" noValidate>
      {rows.length === 0 && <p className={styles.inventoryStatus}>No items. Add one, or save an empty inventory.</p>}
      {rows.map((row, index) => {
        const label = `Item ${index + 1}`;
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
            <button type="button" className={browserStyles.secondaryButton} aria-label={`Remove ${label.toLowerCase()}`} onClick={() => removeRow(row.key)}>
              Remove
            </button>
          </fieldset>
        );
      })}
      {save.error && <p className={browserStyles.statusError} role="alert">{save.error.message}</p>}
      <div className={styles.inventoryActions}>
        <button type="button" className={browserStyles.secondaryButton} onClick={addRow}>Add item</button>
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
