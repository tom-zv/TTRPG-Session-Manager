import React from "react";
import {
  ComboboxInput,
  FormField,
  TagInput,
} from "src/components/FormControls/index.js";
import {
  ALIGNMENT_OPTIONS,
  CREATURE_TYPE_OPTIONS,
} from "../model/options.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";
import styles from "./DnD5eEntityFormSections.module.css";
import { mergeSettings } from "shared/domain/encounters/settings.js";
import { ENTITY_SETTINGS } from "shared/domain/encounters/dnd5e/settings.js";

export const IdentitySection: React.FC<AdvancedSectionsProps> = ({ draft, updateDraft }) => (
  <>
    {draft.role === "npc" && (
      <label>
        <input
          type="checkbox"
          checked={draft.settings.combat?.deathSaves ?? false}
          onChange={(event) => updateDraft("settings", mergeSettings(draft.settings, { combat: { deathSaves: event.target.checked } }))}
        /> {ENTITY_SETTINGS.combat.deathSaves.label}
        <small> {ENTITY_SETTINGS.combat.deathSaves.help}</small>
      </label>
    )}
    {draft.role === "npc" && (
      <label>
        <input
          type="checkbox"
          checked={draft.settings.compendium?.featured ?? false}
          onChange={(event) => updateDraft("settings", mergeSettings(draft.settings, { compendium: { featured: event.target.checked } }))}
        /> {ENTITY_SETTINGS.compendium.featured.label}
        <small> {ENTITY_SETTINGS.compendium.featured.help}</small>
      </label>
    )}
    <div className={styles.gridTwo}>
      <FormField label="Image URL" name="imageUrl" className={styles.wideField}>
        <input
          type="url"
          value={draft.imageUrl}
          onChange={(event) => updateDraft("imageUrl", event.target.value)}
        />
      </FormField>
      <FormField label="Creature Type" name="creatureType" className={styles.mediumField}>
        <ComboboxInput
          id="creature-type"
          name="creature-type"
          options={CREATURE_TYPE_OPTIONS}
          value={draft.creatureType}
          onChange={(value) => updateDraft("creatureType", value)}
          clearLabel="Clear creature type"
        />
      </FormField>
      <FormField label="Alignment" name="alignment" className={styles.mediumField}>
        <ComboboxInput
          id="alignment"
          name="alignment"
          options={ALIGNMENT_OPTIONS}
          value={draft.alignment}
          onChange={(value) => updateDraft("alignment", value)}
          clearLabel="Clear alignment"
        />
      </FormField>
      <FormField label="HP Formula" name="hpFormula" className={styles.shortField}>
        <input
          type="text"
          value={draft.hpFormula}
          onChange={(event) => updateDraft("hpFormula", event.target.value)}
          placeholder="6d10 + 12"
        />
      </FormField>
    </div>
    <TagInput
      label="Type Tags"
      name="typeTags"
      items={draft.typeTags}
      onChange={(items) => updateDraft("typeTags", items)}
      placeholder="shapechanger"
    />
  </>
);
