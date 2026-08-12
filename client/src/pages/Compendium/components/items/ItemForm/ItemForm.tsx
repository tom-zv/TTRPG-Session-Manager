import React, { useRef, useState } from "react";
import {
  ITEM_CATEGORIES,
  ITEM_LIMITS,
  ITEM_RARITIES,
  ITEM_WEAPON_CATEGORIES,
  validateItemInput,
  type Item,
  type ItemCategory,
  type ItemRarity,
  type ItemWeaponCategory,
} from "shared/domain/dnd5e/item.js";
import { FormActions, FormErrorAlert, FormField, TagInput } from "src/components/FormControls/index.js";
import type { ItemMutationScope } from "../../../api/query/itemCache.js";
import { useCreateItem, useUpdateItem } from "../../../api/query/useItemQueries.js";
import { RichText } from "../../RichText/RichText.js";
import { capitalize, formatItemLink } from "../itemFormat.js";
import { ItemPicker } from "../ItemPicker.js";
import {
  MASTERY_PRESETS,
  PROPERTY_PRESETS,
  RECHARGE_OPTIONS,
  blankItemDraft,
  draftToInput,
  itemToDraft,
  type ItemDraft,
  type ItemFormMode,
} from "./itemFormModel.js";
import styles from "./ItemForm.module.css";

type ItemFormProps = {
  mode: ItemFormMode;
  mutationScope: ItemMutationScope;
  onSaved: (item: Item) => void;
  onCancel: () => void;
};

/**
 * Create, edit or duplicate an item. Submits the full snapshot, checked with the shared
 * validateItemInput first; a failed save keeps the draft. A new or duplicated item is always a
 * concrete homebrew item; an edit keeps the item's role and import identity.
 */
export const ItemForm: React.FC<ItemFormProps> = ({ mode, mutationScope, onSaved, onCancel }) => {
  const [draft, setDraft] = useState<ItemDraft>(() =>
    mode.kind === "create" ? blankItemDraft() : itemToDraft(mode.item, { duplicate: mode.kind === "duplicate" })
  );
  const [error, setError] = useState<string | null>(null);
  const createItem = useCreateItem(mutationScope);
  const updateItem = useUpdateItem(mutationScope);
  const editedId = mode.kind === "edit" ? mode.item.id : null;
  const isSubmitting = createItem.isPending || updateItem.isPending;
  const spells = draft.spells ?? [];
  const editedKind = mode.kind === "edit" ? mode.item.kind : "concrete";
  // Only a concrete item names a base, and a generated specific's base is its identity.
  const canChooseBase = editedKind === "concrete" && !draft.baseLocked;
  const [choosingBase, setChoosingBase] = useState(false);
  // Closing the picker returns the focus to the button that opened it.
  const baseOpener = useRef<HTMLButtonElement | null>(null);
  const closeBasePicker = () => {
    setChoosingBase(false);
    baseOpener.current?.focus();
  };

  const update = <Key extends keyof ItemDraft>(key: Key, value: ItemDraft[Key]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const validated = validateItemInput(draftToInput(draft, mode.kind === "create" ? undefined : mode.item.details.charges));
    if (!validated.ok) {
      setError(validated.errors.join("\n"));
      return;
    }
    setError(null);
    // The mutation updates the viewer cache even when the tab is left. This callback belongs
    // to the mounted form, so a late success cannot navigate after the form is dismissed.
    if (editedId !== null) updateItem.mutate({ id: editedId, input: validated.value }, { onSuccess: onSaved });
    else createItem.mutate(validated.value, { onSuccess: onSaved });
  };

  const rechargeOptions = draft.recharge && !RECHARGE_OPTIONS.some(option => option.value === draft.recharge)
    ? [...RECHARGE_OPTIONS, { value: draft.recharge, label: draft.recharge }]
    : RECHARGE_OPTIONS;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormErrorAlert error={error ?? updateItem.error?.message ?? createItem.error?.message ?? null} />
      {/* Settled for this editor: a family's page is its own; its specifics keep their own text. */}
      {editedKind === "family" && (
        <p className={styles.warning} role="note">
          Editing a magic variant changes its own page only. Specific items made from it keep their current text.
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.column}>
          <div className={styles.rowWide}>
            <FormField label="Name" name="item-name">
              <input value={draft.name} onChange={event => update("name", event.target.value)} maxLength={ITEM_LIMITS.name} required />
            </FormField>
            <FormField label="Source" name="item-source">
              <input value={draft.source} onChange={event => update("source", event.target.value)} maxLength={ITEM_LIMITS.source} required />
            </FormField>
            <FormField label="Page" name="item-page">
              <input inputMode="numeric" value={draft.page} onChange={event => update("page", event.target.value)} />
            </FormField>
          </div>

          <div className={styles.row}>
            <FormField label="Category" name="item-category">
              <select value={draft.category} onChange={event => update("category", event.target.value as ItemCategory | "")}>
                <option value="">None</option>
                {ITEM_CATEGORIES.map(category => <option key={category} value={category}>{capitalize(category)}</option>)}
              </select>
            </FormField>
            <FormField label="Rarity" name="item-rarity">
              <select value={draft.rarity} onChange={event => update("rarity", event.target.value as ItemRarity)}>
                {ITEM_RARITIES.map(rarity => <option key={rarity} value={rarity}>{capitalize(rarity)}</option>)}
              </select>
            </FormField>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={draft.wondrous ?? false} onChange={event => update("wondrous", event.target.checked)} />
              Wondrous
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.requiresAttunement}
                onChange={event => update("requiresAttunement", event.target.checked)}
              />
              Requires attunement
            </label>
            <FormField label="Attunement note" name="item-attunement-note">
              <input
                value={draft.attunementNote}
                placeholder={draft.requiresAttunement ? "by a wizard" : "Optional"}
                onChange={event => update("attunementNote", event.target.value)}
                maxLength={ITEM_LIMITS.attunementNote}
              />
            </FormField>
          </div>

          <div className={styles.row}>
            <FormField label="Value (gp)" name="item-value">
              <input inputMode="decimal" value={draft.valueGp} onChange={event => update("valueGp", event.target.value)} />
            </FormField>
            <FormField label="Weight (lb.)" name="item-weight">
              <input inputMode="decimal" value={draft.weightLb} onChange={event => update("weightLb", event.target.value)} />
            </FormField>
          </div>

          {canChooseBase ? (
            <div className={styles.baseItem}>
              <p className={styles.hint}>
                {draft.base ? `Base item: ${formatItemLink(draft.base)}` : "No base item."}{" "}
                <button
                  type="button"
                  className={styles.inlineButton}
                  aria-expanded={choosingBase}
                  onClick={event => {
                    baseOpener.current = event.currentTarget;
                    setChoosingBase(true);
                  }}
                >
                  {draft.base ? "Change base item" : "Choose a base item"}
                </button>
                {draft.base && (
                  <>
                    {" "}
                    <button type="button" className={styles.inlineButton} onClick={() => update("base", null)}>Remove base link</button>
                  </>
                )}
              </p>
              {choosingBase && (
                // The server's rule: a concrete item, not generated from a family, and not this item.
                <ItemPicker
                  viewer={mutationScope.viewer}
                  label="Choose a base item"
                  excludeSpecifics
                  excludeId={editedId ?? undefined}
                  onPick={item => {
                    update("base", { id: item.id, name: item.name, source: item.source });
                    closeBasePicker();
                  }}
                  onCancel={closeBasePicker}
                />
              )}
            </div>
          ) : draft.base && (
            <p className={styles.hint}>
              Base item: {formatItemLink(draft.base)}
              {draft.baseLocked && " (fixed for a generated item)"}
            </p>
          )}

          <fieldset className={styles.fieldset}>
            <legend>Weapon and armor</legend>
            <div className={styles.row}>
              <FormField label="Weapon category" name="item-weapon-category">
                <select value={draft.weaponCategory} onChange={event => update("weaponCategory", event.target.value as ItemWeaponCategory | "")}>
                  <option value="">None</option>
                  {ITEM_WEAPON_CATEGORIES.map(category => <option key={category} value={category}>{capitalize(category)}</option>)}
                </select>
              </FormField>
              <FormField label="Damage dice" name="item-damage-dice">
                <input value={draft.damageDice} placeholder="1d8" onChange={event => update("damageDice", event.target.value)} />
              </FormField>
              <FormField label="Damage type" name="item-damage-type">
                <input value={draft.damageType} placeholder="slashing" onChange={event => update("damageType", event.target.value)} />
              </FormField>
              <FormField label="Versatile damage" name="item-versatile">
                <input value={draft.versatileDice} placeholder="1d10" onChange={event => update("versatileDice", event.target.value)} />
              </FormField>
              <FormField label="Range (ft.)" name="item-range">
                <input value={draft.range} placeholder="80/320" onChange={event => update("range", event.target.value)} />
              </FormField>
              <FormField label="Weapon bonus" name="item-bonus-weapon">
                <input value={draft.bonusWeapon} placeholder="+1" onChange={event => update("bonusWeapon", event.target.value)} />
              </FormField>
            </div>
            <div className={styles.row}>
              <FormField label="Armor class" name="item-armor-class">
                <input inputMode="numeric" value={draft.armorClass} onChange={event => update("armorClass", event.target.value)} />
              </FormField>
              <FormField label="AC bonus" name="item-bonus-ac">
                <input value={draft.bonusAc} placeholder="+1" onChange={event => update("bonusAc", event.target.value)} />
              </FormField>
              <FormField label="Strength requirement" name="item-strength">
                <input inputMode="numeric" value={draft.strength} onChange={event => update("strength", event.target.value)} />
              </FormField>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.stealthDisadvantage ?? false}
                  onChange={event => update("stealthDisadvantage", event.target.checked)}
                />
                Stealth disadvantage
              </label>
            </div>
            <div className={styles.tagGrid}>
              <TagInput label="Properties" name="item-properties" items={draft.properties ?? []} onChange={items => update("properties", items)} presets={PROPERTY_PRESETS} />
              <TagInput label="Mastery" name="item-mastery" items={draft.mastery ?? []} onChange={items => update("mastery", items)} presets={MASTERY_PRESETS} />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Charges</legend>
            <div className={styles.row}>
              <FormField label="Charges" name="item-charges">
                <input value={draft.charges} placeholder="3 or 1d6 + 1" onChange={event => update("charges", event.target.value)} />
              </FormField>
              <FormField label="Recharge" name="item-recharge">
                <select value={draft.recharge} onChange={event => update("recharge", event.target.value)}>
                  <option value="">None</option>
                  {rechargeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>
              <FormField label="Recharge amount" name="item-recharge-amount">
                <input value={draft.rechargeAmount} placeholder="1d6 + 4" onChange={event => update("rechargeAmount", event.target.value)} />
              </FormField>
            </div>
          </fieldset>

          <TagInput label="Aliases" name="item-aliases" items={draft.aliases} onChange={items => update("aliases", items)} placeholder="Other names" />

          <fieldset className={styles.fieldset}>
            <legend>Spells</legend>
            {spells.map((spell, index) => (
              <div className={styles.row} key={index}>
                <FormField label={`Spell ${index + 1} name`} name={`item-spell-${index}-name`}>
                  <input
                    value={spell.name}
                    maxLength={ITEM_LIMITS.name}
                    onChange={event => update("spells", spells.map((entry, i) =>
                      i === index ? { ...entry, name: event.target.value } : entry
                    ))}
                  />
                </FormField>
                <FormField label={`Spell ${index + 1} source`} name={`item-spell-${index}-source`}>
                  <input
                    value={spell.source ?? ""}
                    maxLength={ITEM_LIMITS.source}
                    onChange={event => update("spells", spells.map((entry, i) =>
                      i === index ? { ...entry, source: event.target.value } : entry
                    ))}
                  />
                </FormField>
                <button type="button" className={styles.inlineButton} onClick={() => update("spells", spells.filter((_, i) => i !== index))}>
                  Remove spell {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.inlineButton}
              disabled={spells.length >= ITEM_LIMITS.list}
              onClick={() => update("spells", [...spells, { name: "" }])}
            >
              Add spell
            </button>
          </fieldset>
        </div>

        <div className={styles.column}>
          <FormField label="Description" name="item-description">
            <textarea rows={12} value={draft.description} onChange={event => update("description", event.target.value)} />
          </FormField>
          <section className={styles.preview} aria-label="Description preview">
            <h4>Preview</h4>
            {draft.description.trim() ? <RichText text={draft.description.trim()} /> : <p className={styles.hint}>The description appears here.</p>}
          </section>
        </div>
      </div>

      <FormActions
        submitLabel={isSubmitting ? "Saving…" : mode.kind === "edit" ? "Save item" : "Create item"}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
};
