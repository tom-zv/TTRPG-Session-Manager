import React from "react";
import { FiEye, FiEyeOff, FiTag } from "react-icons/fi";
import { GiTombstone } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { RowTray, RowTrayItem, RowTraySection } from "../RowTray/RowTray.js";
import { NpcDeathSavesToggle } from "./NpcDeathSavesToggle.js";
import { PcControllerSelect } from "./PcControllerSelect.js";
import { PartyMemberToggle } from "./PartyMemberToggle.js";

type EntityRowSecondaryActionsProps = {
  id: string;
  entity: DnD5eEntity;
  actions: DnD5eEncounterActions;
  /** Hide "Move to grave" when the row already offers it, or outside combat. */
  showMoveToGrave: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: (returnFocus: boolean) => void;
};

/**
 * Less frequent GM actions, opened from the row's ⋯ button in a tray beside the row.
 * Actions on this copy come first; options that change the entity everywhere are grouped
 * under its template name.
 */
export const EntityRowSecondaryActions: React.FC<EntityRowSecondaryActionsProps> = ({
  id,
  entity,
  actions,
  showMoveToGrave,
  anchorRef,
  triggerRef,
  onClose,
}) => {
  const entityName = entity.displayName ?? entity.name;
  const hasTemplateOptions = entity.role === "npc" || entity.role === "pc";

  // Actions on this copy close the tray; template options stay open for further changes.
  const runAndClose = (action: () => void) => {
    action();
    onClose(true);
    triggerRef.current?.focus();
  };

  return (
    <RowTray id={id} label={`Actions for ${entityName}`} anchorRef={anchorRef} triggerRef={triggerRef} onClose={onClose}>
      <RowTraySection title={entityName}>
        {showMoveToGrave && (
          <RowTrayItem
            icon={<GiTombstone />}
            tone="danger"
            onClick={() => runAndClose(() => actions.combat.moveToGrave(entity.instanceId))}
          >
            Move to grave
          </RowTrayItem>
        )}
        <RowTrayItem
          icon={entity.hidden ? <FiEye /> : <FiEyeOff />}
          onClick={() => runAndClose(() => actions.combat.setHidden(entity.instanceId, !entity.hidden))}
          title={entity.hidden ? "Show this entity to players" : "Stop showing this entity to players"}
        >
          {entity.hidden ? "Reveal to players" : "Hide from players"}
        </RowTrayItem>
        <RowTrayItem icon={<FiTag />} disabled badge="Soon">
          Conditions
        </RowTrayItem>
      </RowTraySection>

      {hasTemplateOptions && (
        <RowTraySection title={`All copies of ${entity.name}`}>
          {entity.role === "npc" && <NpcDeathSavesToggle entity={entity} />}
          {entity.role === "pc" && <PcControllerSelect entity={entity} />}
          {entity.role === "pc" && <PartyMemberToggle entity={entity} />}
        </RowTraySection>
      )}
    </RowTray>
  );
};
