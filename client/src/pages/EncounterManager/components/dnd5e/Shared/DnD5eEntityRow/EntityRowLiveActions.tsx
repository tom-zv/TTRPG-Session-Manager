import React, { useCallback } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { LiveHpActionControl } from "./LiveHpActionControl.js";
import styles from "./DnD5eEntityRow.module.css";

type EntityRowLiveActionsProps = {
  entity: DnD5eEntity;
  canMutate: boolean;
  sourceId?: number;
  actions: DnD5eEncounterActions;
  showSecondaryActions: boolean;
  onToggleSecondary: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export const EntityRowLiveActions: React.FC<EntityRowLiveActionsProps> = ({
  entity,
  canMutate,
  sourceId,
  actions,
  showSecondaryActions,
  onToggleSecondary,
}) => {
  const handleQuickDamage = useCallback(
    (amount: number) => {
      if (!canMutate || sourceId === undefined) return;
      actions.hp.damage(sourceId, entity.instanceId, amount);
    },
    [actions.hp, canMutate, entity.instanceId, sourceId]
  );

  const handleQuickHeal = useCallback(
    (amount: number) => {
      if (!canMutate || sourceId === undefined) return;
      actions.hp.heal(sourceId, entity.instanceId, amount);
    },
    [actions.hp, canMutate, entity.instanceId, sourceId]
  );

  return (
    <>
      <div className={styles.entityActionsPrimary}>
        <LiveHpActionControl
          entityName={entity.displayName ?? entity.name}
          disabled={!canMutate || sourceId === undefined}
          onDamage={handleQuickDamage}
          onHeal={handleQuickHeal}
        />
      </div>

      {showSecondaryActions && (
        <div
          id={`entity-secondary-actions-${entity.instanceId}`}
          className={styles.entityActionsSecondary}
        >
          <button type="button" className={styles.actionButton} disabled title="Coming soon">
            Condition
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={onToggleSecondary}
            title="Collapse additional actions"
          >
            Collapse
          </button>
        </div>
      )}
    </>
  );
};
