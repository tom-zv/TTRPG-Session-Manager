import React, { useId, useRef, useState } from "react";
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

/**
 * A PC's or featured NPC's inventory on their sheet: a manual, ordered list of what they carry.
 * Render it only for an eligible template; the server answers 404 for anything else.
 */
export const InventorySection: React.FC<InventorySectionProps> = ({ entityId, viewerId, canEdit }) => {
  const headingId = useId();
  const { data: items, error, isLoading } = useInventory(viewerId, entityId);
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
  } else body = <InventoryList items={items} />;

  return (
    <section className={styles.inventory} aria-labelledby={headingId}>
      <div className={styles.inventoryHeader}>
        <h3 id={headingId}>Inventory</h3>
        {canEdit && items && !editing && (
          <button type="button" className={browserStyles.secondaryButton} onClick={() => setEditing(true)}>
            Edit inventory
          </button>
        )}
      </div>
      {body}
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
  const nextKey = useRef(items.length);
  const [rows, setRows] = useState<DraftRow[]>(() => items.map((item, index) => ({
    key: index, name: item.name, quantity: String(item.quantity), notes: item.notes ?? "",
  })));
  const save = useSaveInventory(viewerId, entityId);

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => setRows(current => [...current, { key: nextKey.current++, name: "", quantity: "1", notes: "" }]);
  const removeRow = (key: number) => setRows(current => current.filter(row => row.key !== key));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // The server validates and trims; a rejected list stays in the editor with its message.
    const draft = rows.map(row => ({
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
