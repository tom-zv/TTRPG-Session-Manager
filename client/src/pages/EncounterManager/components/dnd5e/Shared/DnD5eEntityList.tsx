import { useOrderedEntities } from "../../../hooks/dnd5e/useOrderedEntities.js";
import React, { useCallback } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import type { HpDisplay } from "shared/domain/encounters/dnd5e/view.js";
import { DnD5eEntityRow } from "./DnD5eEntityRow/DnD5eEntityRow.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import styles from "./DnD5eEntityList.module.css";

type EntityListProps = {
  entities: DnD5eEntity[];
  initiativeOrder: number[];
  currentTurn?: number;
  mode: "edit" | "live";
  actions: DnD5eEncounterActions;
  canMutate?: boolean;
  /** Whether the viewer may run this entity. Defaults to `canMutate` for every entity. */
  canControlEntity?: (entity: DnD5eEntity) => boolean;
  /** How much of an entity's HP the viewer is shown. Defaults to exact numbers. */
  hpDisplayFor?: (entity: DnD5eEntity) => HpDisplay;
  sourceId?: number;
  selectedEntityId?: number;
  onSelectEntity?: (entityId: number) => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  topAdornment?: React.ReactNode;
  /** Rendered after the rows, inside the same scroll container (e.g. the grave). */
  bottomAdornment?: React.ReactNode;
};

const DnD5eEntityListComponent: React.FC<EntityListProps> = ({
  entities,
  initiativeOrder,
  currentTurn,
  mode,
  actions,
  canMutate = true,
  canControlEntity,
  hpDisplayFor,
  sourceId,
  selectedEntityId,
  onSelectEntity,
  isPinned,
  onTogglePin,
  topAdornment,
  bottomAdornment,
}) => {
  const handleRemove = useCallback(
    (id: number) => {
      actions.global.removeEntity(id);
    },
    [actions]
  );

  const orderedEntities = useOrderedEntities(entities, initiativeOrder);

  return (
    <div className={styles.entityList}>
      {topAdornment && <div className={styles.entityListTopAdornment}>{topAdornment}</div>}
      {orderedEntities.length === 0 && !bottomAdornment ? (
        <p>{entities.length ? "No entities remain in initiative." : "No entities in this encounter yet."}</p>
      ) : (
        <div className={styles.entityRows}>
          {orderedEntities.length === 0 && (
            <p className={styles.emptyMessage}>
              {entities.length ? "No entities remain in initiative." : "No entities in this encounter yet."}
            </p>
          )}
          {orderedEntities.map((entity) => (
            <DnD5eEntityRow
              key={entity.instanceId}
              entity={entity}
              isActive={currentTurn !== undefined && entity.instanceId === initiativeOrder[currentTurn]}
              isSelected={entity.instanceId === selectedEntityId}
              mode={mode}
              actions={actions}
              onRemove={handleRemove}
              canMutate={canMutate}
              canControl={canControlEntity ? canControlEntity(entity) : canMutate}
              hpDisplay={hpDisplayFor?.(entity)}
              sourceId={sourceId}
              onSelect={onSelectEntity}
              isPinned={entity.instanceId === selectedEntityId ? isPinned : undefined}
              onTogglePin={entity.instanceId === selectedEntityId ? onTogglePin : undefined}
            />
          ))}
          {bottomAdornment}
        </div>
      )}
    </div>
  );
};

DnD5eEntityListComponent.displayName = "DnD5eEntityList";

export const DnD5eEntityList = React.memo(DnD5eEntityListComponent);
