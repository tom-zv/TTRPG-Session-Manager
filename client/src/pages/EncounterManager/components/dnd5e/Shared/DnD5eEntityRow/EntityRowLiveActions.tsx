import React, { useCallback } from "react";
import { GiTombstone } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { LiveHpActionControl } from "./LiveHpActionControl.js";
import styles from "./DnD5eEntityRow.module.css";

type EntityRowLiveActionsProps = {
  entity: DnD5eEntity;
  canMutate: boolean;
  sourceId?: number;
  actions: DnD5eEncounterActions;
  /** Show the Bury button in the primary actions (the entity is waiting for the DM's decision). */
  offerBurial: boolean;
};

export const EntityRowLiveActions: React.FC<EntityRowLiveActionsProps> = ({
  entity,
  canMutate,
  sourceId,
  actions,
  offerBurial,
}) => {
  const entityName = entity.displayName ?? entity.name;

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
    <div className={styles.entityActionsPrimary}>
      <LiveHpActionControl
        entityName={entityName}
        disabled={!canMutate || sourceId === undefined}
        onDamage={handleQuickDamage}
        onHeal={handleQuickHeal}
      />
      {canMutate && offerBurial && (
        <button
          type="button"
          className={`${styles.actionButton} ${styles.buryButton}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.combat.moveToGrave(entity.instanceId);
          }}
          title={`Move ${entityName} to the grave`}
          aria-label={`Move ${entityName} to the grave`}
        >
          <GiTombstone aria-hidden="true" />
          Bury
        </button>
      )}
    </div>
  );
};
