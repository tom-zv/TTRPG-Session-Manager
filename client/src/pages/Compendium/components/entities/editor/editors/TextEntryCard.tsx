import React, { useRef, useState } from "react";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import type { SpellEntry } from "shared/domain/encounters/dnd5e/entity.js";
import type { ItemSummary } from "shared/domain/dnd5e/item.js";
import { ItemPicker } from "../../../items/ItemPicker.js";
import { useActiveEdit, useEditorState } from "../EntityEditContext.js";
import type { LayoutItem } from "../model/entryLayout.js";
import { EntryCardFrame, descriptionTooLong, sameValue, type EntryCardHost } from "./EntryCardFrame.js";
import { Field } from "./PopoverForm.js";
import { SpellSearch } from "./SpellSearch.js";
import { textProblem } from "./fieldLimits.js";
import styles from "./EntryCards.module.css";

type TextItem = Extract<LayoutItem, { kind: "trait" | "action" }>;

/** A reference tag in the text format of `shared/domain/dnd5e/richText.ts`. */
const referenceTag = (type: "spell" | "item", name: string, source?: string): string =>
  `{@${type} ${source ? `${name}|${source}` : name}}`;

/**
 * A trait or action as a card: its name and raw text (tags as written), buttons that insert spell
 * and item tags at the cursor, and the section it belongs to.
 */
export const TextEntryCard: React.FC<{ host: EntryCardHost; item: TextItem }> = ({ host, item }) => {
  const { viewer } = useActiveEdit();
  const [name, setName] = useEditorState("text.name", item.value.name);
  const [description, setDescription] = useEditorState("text.description", item.value.description);
  const [section, setSection] = useEditorState("text.section", host.sectionKey);
  const [inserting, setInserting] = useState<"spell" | "item" | null>(null);
  const [error, setError] = useEditorState<string | null>("text.error", null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const spellButtonRef = useRef<HTMLButtonElement>(null);
  const itemButtonRef = useRef<HTMLButtonElement>(null);
  // A picker closed without a choice gives focus back to the button that opened it.
  const closePicker = () => {
    const button = inserting === "item" ? itemButtonRef.current : spellButtonRef.current;
    setInserting(null);
    button?.focus();
  };

  const insert = (tag: string) => {
    const area = textRef.current;
    const start = area?.selectionStart ?? description.length;
    const end = area?.selectionEnd ?? start;
    setDescription(description.slice(0, start) + tag + description.slice(end));
    setInserting(null);
    // Back in the text, after the tag.
    window.requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const read = () => {
    if (!name.trim() && !description.trim()) return { item: null, section };
    const problem = textProblem(name, ENTITY_LIMITS.entryName, true) ?? textProblem(description);
    if (problem) {
      setError(name.trim() ? `Text: ${problem}` : `Name: ${problem}`);
      return false as const;
    }
    if (descriptionTooLong(description, ENTITY_LIMITS.descriptionBytes)) {
      setError("Text: this is too long to save.");
      return false as const;
    }
    const value = {
      ...item.value,
      name: name === item.value.name ? name : name.trim(),
      description: description === item.value.description ? description : description.trim(),
    };
    // An untouched entry stays the same row, so committing it changes nothing.
    return { item: sameValue(value, item.value) ? item : ({ ...item, value } as TextItem), section };
  };

  return (
    <EntryCardFrame host={host} read={read} error={error} name={name.trim()}>
      <Field label="Name">
        {id => <input id={id} value={name} onChange={event => { setName(event.target.value); setError(null); }} />}
      </Field>
      <Field label="Text">
        {id => (
          <textarea
            id={id}
            ref={textRef}
            rows={5}
            value={description}
            onChange={event => { setDescription(event.target.value); setError(null); }}
          />
        )}
      </Field>
      <div className={styles.row}>
        <button ref={spellButtonRef} type="button" aria-expanded={inserting === "spell"} onClick={() => setInserting(inserting === "spell" ? null : "spell")}>
          Insert spell
        </button>
        {viewer && (
          <button ref={itemButtonRef} type="button" aria-expanded={inserting === "item"} onClick={() => setInserting(inserting === "item" ? null : "item")}>
            Insert item
          </button>
        )}
        <Field label="Section">
          {id => (
            <select id={id} value={section} onChange={event => setSection(event.target.value)}>
              {host.sectionChoices.map(choice => <option key={choice.key} value={choice.key}>{choice.title}</option>)}
            </select>
          )}
        </Field>
      </div>
      {inserting === "spell" && (
        <SpellSearch
          label="Spell to insert"
          focusOnMount
          allowUnknown
          onPick={(spell: SpellEntry) => insert(referenceTag("spell", spell.name, spell.source))}
          onEscape={closePicker}
        />
      )}
      {inserting === "item" && viewer && (
        <ItemPicker
          viewer={viewer}
          label="Choose an item to insert"
          onPick={(picked: ItemSummary) => insert(referenceTag("item", picked.name, picked.source))}
          onCancel={closePicker}
        />
      )}
    </EntryCardFrame>
  );
};
