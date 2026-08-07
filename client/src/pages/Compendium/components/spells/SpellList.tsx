import React from "react";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { BrowserList, type SelectVia } from "../browser/BrowserList.js";
import { capitalize, formatSpellLevelShort } from "./spellFilters.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./SpellBrowser.module.css";

type SpellListProps = {
  spells: SpellSummary[];
  selectedId: number | null;
  onSelect: (id: number, via: SelectVia) => void;
  /** Enter on the list: open the spell's details. */
  onActivate: () => void;
};

const spellId = (spell: SpellSummary) => spell.id;

const renderSpellRow = (spell: SpellSummary) => (
  <>
    <span className={browserStyles.rowName}>
      {spell.name}
      {spell.concentration && <abbr className={styles.badge} title="Concentration">C</abbr>}
      {spell.ritual && <abbr className={styles.badge} title="Ritual">R</abbr>}
    </span>
    <span className={browserStyles.rowMeta}>
      <span>{formatSpellLevelShort(spell.level)}</span>
      <span>{capitalize(spell.school)}</span>
      <span>{spell.castingTime}</span>
      <span className={styles.rowComponents}>
        {[spell.components.v && "V", spell.components.s && "S", spell.components.m && "M"].filter(Boolean).join(" ")}
      </span>
    </span>
  </>
);

export const SpellList: React.FC<SpellListProps> = ({ spells, selectedId, onSelect, onActivate }) => (
  <BrowserList
    items={spells}
    getId={spellId}
    renderRow={renderSpellRow}
    label="Spells"
    idPrefix="spell-option"
    selectedId={selectedId}
    onSelect={onSelect}
    onActivate={onActivate}
  />
);
