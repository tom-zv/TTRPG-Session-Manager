import React from "react";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { BrowserList, type SelectVia } from "../browser/BrowserList.js";
import browserStyles from "../browser/Browser.module.css";
import { SourceBadge } from "./SourceBadge.js";
import styles from "./Entities.module.css";

type EntityListProps = {
  entities: DnD5eEntitySummary[];
  /** The listbox's accessible name, e.g. "Entities" or "My characters". */
  label: string;
  selectedId: number | null;
  onSelect: (id: number, via: SelectVia) => void;
  onActivate: () => void;
};

const ROLE_LABELS: Record<DnD5eEntitySummary["role"], string> = { pc: "PC", npc: "NPC", creature: "Creature" };

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const entityId = (entity: DnD5eEntitySummary) => entity.templateId;

const renderEntityRow = (entity: DnD5eEntitySummary) => (
  <>
    <span className={browserStyles.rowName}>
      {entity.name}
      <span className={styles.roleBadge}>{ROLE_LABELS[entity.role]}</span>
      <SourceBadge entity={entity} />
      {entity.role === "pc" && entity.inParty && <span className={styles.tagBadge}>Party</span>}
      {entity.role === "npc" && entity.featuredNpc && <span className={styles.tagBadge}>Featured</span>}
    </span>
    <span className={browserStyles.rowMeta}>
      {entity.cr && <span>CR {entity.cr}</span>}
      <span>{[capitalize(entity.size), entity.creatureType].filter(Boolean).join(" ")}</span>
      <span className={styles.rowHp}>{entity.hp} HP</span>
    </span>
  </>
);

export const EntityList: React.FC<EntityListProps> = ({ entities, label, selectedId, onSelect, onActivate }) => (
  <BrowserList
    items={entities}
    getId={entityId}
    renderRow={renderEntityRow}
    label={label}
    idPrefix="entity-option"
    selectedId={selectedId}
    onSelect={onSelect}
    onActivate={onActivate}
  />
);
