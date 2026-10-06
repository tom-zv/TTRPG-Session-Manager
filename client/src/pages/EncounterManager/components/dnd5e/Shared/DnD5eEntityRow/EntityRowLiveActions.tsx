import React, { useCallback, useEffect, useState } from "react";
import { GiTombstone } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import type { HpDisplay } from "shared/domain/encounters/dnd5e/view.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { LiveHpActionControl } from "./LiveHpActionControl.js";
import styles from "./DnD5eEntityRow.module.css";

const FEEDBACK_DISPLAY_MS = 6000;

type EntityRowLiveActionsProps = {
  entity: DnD5eEntity;
  canMutate: boolean;
  /** May damage or heal this entity (the GM, or a player with a visible combatant of their own). */
  canAdjustHp: boolean;
  /** How much of the HP this viewer is shown. Below exact, a change is confirmed by its amount only. */
  hpDisplay?: HpDisplay;
  sourceId?: number;
  actions: DnD5eEncounterActions;
  /** Show the Bury button in the primary actions (the entity is waiting for the DM's decision). */
  offerBurial: boolean;
};

export const EntityRowLiveActions: React.FC<EntityRowLiveActionsProps> = ({
  entity,
  canMutate,
  canAdjustHp,
  hpDisplay = "exact",
  sourceId,
  actions,
  offerBurial,
}) => {
  const entityName = entity.displayName ?? entity.name;
  // With concealed HP the row would not change visibly, so the amount sent is confirmed instead.
  // It never states the resulting or remaining HP.
  const [feedback, setFeedback] = useState<string | null>(null);
  const concealed = hpDisplay !== "exact";

  useEffect(() => {
    if (feedback === null) return;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleQuickDamage = useCallback(
    (amount: number) => {
      if (!canAdjustHp || sourceId === undefined) return;
      void actions.hp.damage(sourceId, entity.instanceId, amount).then((applied) => {
        if (applied && concealed) setFeedback(`Dealt ${amount} damage to ${entityName}.`);
      });
    },
    [actions.hp, canAdjustHp, concealed, entity.instanceId, entityName, sourceId]
  );

  const handleQuickHeal = useCallback(
    (amount: number) => {
      if (!canAdjustHp || sourceId === undefined) return;
      void actions.hp.heal(sourceId, entity.instanceId, amount).then((applied) => {
        if (applied && concealed) setFeedback(`Healed ${entityName} by ${amount}.`);
      });
    },
    [actions.hp, canAdjustHp, concealed, entity.instanceId, entityName, sourceId]
  );

  return (
    <div className={styles.entityActionsPrimary}>
      <LiveHpActionControl
        entityName={entityName}
        disabled={!canAdjustHp || sourceId === undefined}
        onDamage={handleQuickDamage}
        onHeal={handleQuickHeal}
      />
      {concealed && (
        <span role="status" className={styles.hpFeedback}>{feedback}</span>
      )}
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
