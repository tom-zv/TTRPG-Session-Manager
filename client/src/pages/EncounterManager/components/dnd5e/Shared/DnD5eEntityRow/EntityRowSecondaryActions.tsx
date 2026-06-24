import React, { useRef } from "react";
import { GiTombstone } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { useEscapeWithin } from "src/pages/EncounterManager/hooks/useEscapeWithin.js";
import { NpcDeathSavesToggle } from "./NpcDeathSavesToggle.js";
import { PcControllerSelect } from "./PcControllerSelect.js";
import styles from "./DnD5eEntityRow.module.css";

type EntityRowSecondaryActionsProps = {
  id: string;
  entity: DnD5eEntity;
  actions: DnD5eEncounterActions;
  /** Hide "Move to grave" when the primary actions already offer it. */
  showMoveToGrave: boolean;
  onClose: () => void;
};

/** Less frequent GM actions, opened from the row's ⋯ button. Escape closes it. */
export const EntityRowSecondaryActions: React.FC<EntityRowSecondaryActionsProps> = ({
  id,
  entity,
  actions,
  showMoveToGrave,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeWithin(panelRef, onClose);

  return (
    <div ref={panelRef} id={id} className={styles.entityActionsSecondary}>
      <div className={styles.secondaryButtons}>
        {showMoveToGrave && (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.buryButton}`}
            onClick={() => {
              actions.combat.moveToGrave(entity.instanceId);
              onClose();
            }}
          >
            <GiTombstone aria-hidden="true" />
            Move to grave
          </button>
        )}
        <button type="button" className={styles.actionButton} disabled title="Coming soon">
          Condition
        </button>
      </div>
      {entity.role === "npc" && <NpcDeathSavesToggle entity={entity} />}
      {entity.role === "pc" && <PcControllerSelect entity={entity} />}
    </div>
  );
};
