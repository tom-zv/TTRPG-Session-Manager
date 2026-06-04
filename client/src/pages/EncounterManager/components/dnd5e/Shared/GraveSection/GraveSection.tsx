import React, { useCallback, useId, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { GiTombstone } from "react-icons/gi";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import type { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { GraveEntityRow } from "../DnD5eEntityRow/GraveEntityRow.js";
import styles from "./GraveSection.module.css";

type GraveSectionProps = {
  encounterId: number;
  entities: DnD5eEntity[];
  actions: DnD5eEncounterActions;
  canMutate: boolean;
  selectedEntityId?: number;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onSelectEntity?: (entityId: number) => void;
};

const collapsedKey = (encounterId: number) => `grave-collapsed:${encounterId}`;

function readCollapsed(encounterId: number): boolean {
  try {
    return window.localStorage.getItem(collapsedKey(encounterId)) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(encounterId: number, collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(collapsedKey(encounterId), "1");
    else window.localStorage.removeItem(collapsedKey(encounterId));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the toggle still works for this visit.
  }
}

/**
 * Entities out of initiative, rendered after the initiative rows in the same list.
 * Hidden while empty. Collapsed state is remembered per viewer and encounter.
 */
export const GraveSection: React.FC<GraveSectionProps> = ({
  encounterId,
  entities,
  actions,
  canMutate,
  selectedEntityId,
  isPinned,
  onTogglePin,
  onSelectEntity,
}) => {
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(encounterId));
  // Bumped whenever an entity is buried, to replay the header's pulse.
  const [pulse, setPulse] = useState(0);
  const [previousCount, setPreviousCount] = useState(entities.length);
  if (entities.length !== previousCount) {
    if (entities.length > previousCount) setPulse((value) => value + 1);
    setPreviousCount(entities.length);
  }

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      writeCollapsed(encounterId, !previous);
      return !previous;
    });
  };

  const handleRestore = useCallback((entityId: number, hp: number) => {
    actions.combat.restoreFromGrave(entityId, hp);
  }, [actions.combat]);

  const handleRemove = useCallback((entityId: number) => {
    actions.global.removeEntity(entityId);
  }, [actions.global]);

  if (entities.length === 0) return null;

  return (
    <section className={styles.grave} aria-label="Grave">
      <button
        type="button"
        className={styles.header}
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
      >
        <span key={`icon-${pulse}`} className={`${styles.icon}${pulse ? ` ${styles.pulse}` : ""}`} aria-hidden="true">
          <GiTombstone />
        </span>
        <span className={styles.title}>Grave</span>
        <span key={`count-${pulse}`} className={`${styles.count}${pulse ? ` ${styles.pulse}` : ""}`}>
          {entities.length}
        </span>
        <span className={styles.rule} aria-hidden="true" />
        <FiChevronDown className={`${styles.chevron}${collapsed ? ` ${styles.chevronCollapsed}` : ""}`} aria-hidden="true" />
      </button>

      {!collapsed && (
        <div id={bodyId} className={styles.rows}>
          {entities.map((entity) => {
            const isSelected = entity.instanceId === selectedEntityId;
            return (
              <GraveEntityRow
                key={entity.instanceId}
                entity={entity}
                canMutate={canMutate}
                isSelected={isSelected}
                isPinned={isSelected ? isPinned : undefined}
                onTogglePin={isSelected ? onTogglePin : undefined}
                onSelect={onSelectEntity}
                onRestore={handleRestore}
                onRemove={handleRemove}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};
