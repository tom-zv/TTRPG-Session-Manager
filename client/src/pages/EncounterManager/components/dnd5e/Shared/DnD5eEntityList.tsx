import React, { useCallback, useMemo } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
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
  sourceId?: number;
  selectedEntityId?: number;
  onSelectEntity?: (entityId: number) => void;
};

const DnD5eEntityListComponent: React.FC<EntityListProps> = ({
  entities,
  initiativeOrder,
  currentTurn,
  mode,
  actions,
  canMutate = true,
  sourceId,
  selectedEntityId,
  onSelectEntity,
}) => {
  const handleRemove = useCallback(
    (id: number) => {
      actions.global.removeEntity(id);
    },
    [actions]
  );

  const entityByInstanceId = useMemo(
    () => new Map(entities.map((e) => [e.instanceId, e])),
    [entities]
  );

  const orderedEntities = useMemo(() => {
    const initiativeSet = new Set(initiativeOrder);

    // Get ordered entities
    const ordered = initiativeOrder
      .map((instanceId) => entityByInstanceId.get(instanceId))
      .filter((entity): entity is DnD5eEntity => entity !== undefined);

    entities.forEach((entity) => {
      if (!initiativeSet.has(entity.instanceId)) {
        ordered.push(entity);
      }
    });

    return ordered;
  }, [entities, entityByInstanceId, initiativeOrder]);

  return (
    <div className={styles.entityList}>
      <h2>Entities</h2>
      {entities.length === 0 ? (
        <p>No entities in this encounter yet.</p>
      ) : (
        <div className={styles.entityRows}>
          {orderedEntities.map((entity, index) => (
            <DnD5eEntityRow
              key={entity.instanceId}
              entity={entity}
              isActive={index === currentTurn}
              isSelected={entity.instanceId === selectedEntityId}
              mode={mode}
              actions={actions}
              onRemove={handleRemove}
              canMutate={canMutate}
              sourceId={sourceId}
              onSelect={onSelectEntity}
            />
          ))}
        </div>
      )}
    </div>
  );
};

DnD5eEntityListComponent.displayName = "DnD5eEntityList";

export const DnD5eEntityList = React.memo(DnD5eEntityListComponent);
