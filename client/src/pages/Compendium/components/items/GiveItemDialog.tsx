import React, { useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Item } from "shared/domain/dnd5e/item.js";
import Dialog from "src/components/Dialog/Dialog.js";
import { useDnD5eEntitySummaries } from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import { useAppendInventoryItem } from "../../api/query/useInventoryQueries.js";
import { compendiumLinkSearch } from "../../hooks/useCompendiumUrl.js";
import { formatItemLink } from "./itemFormat.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Items.module.css";

type GiveItemDialogProps = {
  /** A concrete item: a family or group has no single printing to give. */
  item: Item;
  /** The signed-in GM; their cached inventory for the character is updated from the answer while they still are. */
  scope: ItemMutationScope;
  onClose: () => void;
};

/**
 * GM: add one concrete item to a player character's or featured NPC's inventory. The server
 * appends it to the latest list under the character's lock, so it never overwrites another edit.
 */
export const GiveItemDialog: React.FC<GiveItemDialogProps> = ({ item, scope, onClose }) => {
  const formId = useId();
  const { data: entities, isLoading, error } = useDnD5eEntitySummaries();
  const eligible = (entities ?? [])
    .filter(entity => entity.role === "pc" || entity.featuredNpc)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [entityId, setEntityId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const give = useAppendInventoryItem(scope);
  const [given, setGiven] = useState<{ entityId: number; name: string } | null>(null);
  const [params] = useSearchParams();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const target = eligible.find(entity => String(entity.templateId) === entityId);
    if (!target) return;
    give.mutate(
      { entityId: target.templateId, append: { itemId: item.id, quantity: Number(quantity), ...(notes.trim() ? { notes } : {}) } },
      { onSuccess: () => setGiven({ entityId: target.templateId, name: target.name }) },
    );
  };

  return (
    <Dialog isOpen onClose={onClose} title={`Give ${item.name}`}>
      {given ? (
        <div className={styles.confirm}>
          <p role="status">
            Added {item.name} to {given.name}’s inventory.{" "}
            <Link to={{ search: compendiumLinkSearch(params, "entities", given.entityId) }} onClick={onClose}>
              Open {given.name}
            </Link>
          </p>
          <div className={browserStyles.actionRow}>
            <button type="button" className={browserStyles.secondaryButton} onClick={() => { setGiven(null); give.reset(); }}>
              Give to another
            </button>
            <button type="button" className={browserStyles.primaryButton} onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form id={formId} className={styles.giveForm} onSubmit={submit} noValidate>
          <p className={browserStyles.hint}>{formatItemLink(item)}{item.family && item.base ? `, made from ${formatItemLink(item.base)}` : ""}</p>
          {error && <p className={browserStyles.statusError} role="alert">{error.message}</p>}
          <label>
            Character
            <select value={entityId} onChange={event => setEntityId(event.target.value)} disabled={isLoading}>
              <option value="">{isLoading ? "Loading characters…" : "Choose a character"}</option>
              {eligible.map(entity => (
                <option key={entity.templateId} value={entity.templateId}>
                  {entity.name}{entity.role === "pc" ? "" : " (featured NPC)"}
                </option>
              ))}
            </select>
          </label>
          {!isLoading && !error && eligible.length === 0 && (
            <p className={browserStyles.hint}>No player characters or featured NPCs yet.</p>
          )}
          <label>
            Quantity
            <input type="number" min={1} step={1} value={quantity} onChange={event => setQuantity(event.target.value)} />
          </label>
          <label>
            Notes
            <input value={notes} onChange={event => setNotes(event.target.value)} />
          </label>
          {give.error && <p className={browserStyles.statusError} role="alert">{give.error.message}</p>}
          <div className={browserStyles.actionRow}>
            <button type="button" className={browserStyles.secondaryButton} onClick={onClose}>Cancel</button>
            <button type="submit" className={browserStyles.primaryButton} disabled={entityId === "" || give.isPending}>
              {give.isPending ? "Giving…" : "Give item"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
};
