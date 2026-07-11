import React, { useCallback, useRef, useState } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import { FiEyeOff } from "react-icons/fi";
import type { HpDisplay } from "shared/domain/encounters/dnd5e/view.js";
import { EditableField } from "src/components/FormControls/index.js";
import { EntityHpStats } from "./EntityHpStats.js";
import { EntityRowLiveActions } from "./EntityRowLiveActions.js";
import { EntityRowSecondaryActions } from "./EntityRowSecondaryActions.js";
import { DeathSaveTracker } from "./DeathSaveTracker.js";
import { EntityVitalBadge } from "./EntityVitalBadge.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { RowSelectionMarker } from "./RowSelectionMarker.js";
import { getVitalStatus, isAwaitingBurial } from "./vitalStatus.js";
import { isFromNestedControl } from "./rowEvents.js";
import styles from "./DnD5eEntityRow.module.css";

type DnD5eEntityRowProps = {
  entity: DnD5eEntity;
  isActive: boolean;
  isSelected?: boolean;
  mode: "edit" | "live";
  actions: DnD5eEncounterActions;
  onRemove: (entityId: number) => void;
  /** GM powers: change membership, maximum HP, the grave and template options. */
  canMutate?: boolean;
  /** Run this entity: its current HP, initiative and death saves. A GM, or the player it is assigned to. */
  canControl?: boolean;
  /** How much of the HP this viewer is shown. */
  hpDisplay?: HpDisplay;
  sourceId?: number;
  onSelect?: (entityId: number) => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
};

const DnD5eEntityRowComponent: React.FC<DnD5eEntityRowProps> = ({
  entity,
  isActive,
  isSelected = false,
  mode,
  actions,
  onRemove,
  canMutate = true,
  canControl = canMutate,
  hpDisplay = "exact",
  sourceId,
  onSelect,
  isPinned,
  onTogglePin,
}) => {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showSecondaryActions, setShowSecondaryActions] = useState(false);

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRemoveConfirm(true);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    onRemove(entity.instanceId);
    setShowRemoveConfirm(false);
  }, [entity.instanceId, onRemove]);

  const handleCancelRemove = useCallback(() => {
    setShowRemoveConfirm(false);
  }, []);

  const rowRef = useRef<HTMLDivElement>(null);
  const secondaryTriggerRef = useRef<HTMLButtonElement>(null);

  const handleToggleSecondaryActions = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowSecondaryActions((previous) => !previous);
  }, []);

  const handleCloseSecondaryActions = useCallback(() => {
    setShowSecondaryActions(false);
  }, []);

  const handleInitiativeChange = useCallback((init: number) => {
    actions.stats.setInitiative(entity.instanceId, init);
  }, [actions.stats, entity.instanceId]);

  const handleMaxHpChange = useCallback((newMaxHp: number) => {
    actions.hp.setHp(entity.instanceId, newMaxHp);
  }, [actions.hp, entity.instanceId]);

  const handleCurrentHpChange = useCallback((newCurrentHp: number) => {
    actions.hp.setCurrentHp(entity.instanceId, newCurrentHp);
  }, [actions.hp, entity.instanceId]);

  const handleDeathSavesChange = useCallback((successes: number, failures: number) => {
    actions.combat.setDeathSaves(entity.instanceId, successes, failures);
  }, [actions.combat, entity.instanceId]);

  const handleSelectRow = useCallback(() => {
    onSelect?.(entity.instanceId);
  }, [onSelect, entity.instanceId]);

  const isLive = mode === "live";
  const entityName = entity.displayName ?? entity.name;
  // A 0 HP badge would give away what the HP display is meant to keep back.
  const vitalStatus = isLive && hpDisplay !== "hidden" ? getVitalStatus(entity) : null;
  const offerBurial = isAwaitingBurial(vitalStatus);
  const showDeathSaves = vitalStatus === "dying" || vitalStatus === "stable" || vitalStatus === "dead";
  const secondaryActionsId = `entity-secondary-actions-${entity.instanceId}`;

  const conditionNames = entity.conditions?.map((condition) => condition.name).join(", ");
  const hasConditions = Boolean(conditionNames);

  const rowClassName = [
    styles.entityRow,
    isActive && styles.active,
    isSelected && styles.selected,
    vitalStatus && styles.down,
    showSecondaryActions && canMutate && styles.trayOpen,
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={rowRef}
      className={rowClassName}
      onClick={(e) => {
        if (!isFromNestedControl(e)) handleSelectRow();
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) {
          return;
        }

        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelectRow();
        }
      }}
    >
      <div className={styles.initiativeTab} aria-label="Initiative value">
        {canControl && actions ? (
          <EditableField
            type="number"
            value={entity.initiative}
            onChange={handleInitiativeChange}
            min={-10}
            max={50}
            className={`${styles.statValue} ${styles.initiativeTabValue}`}
            displayClassName={styles.inlineNumberDisplay}
            inputClassName={styles.inlineNumberInput}
            compact
          />
        ) : (
          <span className={`${styles.statValue} ${styles.initiativeTabValue}`}>{entity.initiative}</span>
        )}
      </div>

      <div className={styles.entityRowTop}>
        <div className={styles.entityIdentity}>
          <h3 className={styles.entityName}>{entityName}</h3>
          {vitalStatus && <EntityVitalBadge status={vitalStatus} />}
          {entity.hidden && (
            <span className={styles.hiddenBadge} title="Players do not see this entity">
              <FiEyeOff aria-hidden="true" />
              Hidden
            </span>
          )}
        </div>
        <div className={styles.topControls}>
          {canMutate && mode === "edit" && (showRemoveConfirm ? (
            <InlineConfirm
              label="Remove?"
              confirmLabel="Confirm remove entity"
              cancelLabel="Cancel remove entity"
              onConfirm={handleConfirmRemove}
              onCancel={handleCancelRemove}
            />
          ) : (
            <button
              type="button"
              className={styles.entityRemoveButton}
              onClick={handleRemoveClick}
              title={`Remove ${entity.name}`}
              aria-label={`Remove ${entity.name} from encounter`}
            >
              ✕
            </button>
          ))}
          {canMutate && (
            <button
              ref={secondaryTriggerRef}
              type="button"
              className={`${styles.secondaryToggleButton}${showSecondaryActions ? ` ${styles.secondaryToggleOpen}` : ""}`}
              onClick={handleToggleSecondaryActions}
              aria-haspopup="dialog"
              aria-expanded={showSecondaryActions}
              aria-controls={secondaryActionsId}
              aria-label={`More actions for ${entityName}`}
              title="More actions"
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      <div className={styles.entityRowContent}>
        <EntityHpStats
          entity={entity}
          mode={mode}
          canMutate={canMutate}
          canControl={canControl}
          hpDisplay={hpDisplay}
          onMaxHpChange={handleMaxHpChange}
          onCurrentHpChange={handleCurrentHpChange}
        />

        {hasConditions && (
          <div className={styles.entityConditions}>
            <strong>Conditions:</strong> {conditionNames}
          </div>
        )}

        {isLive && (
          <EntityRowLiveActions
            entity={entity}
            canMutate={canMutate}
            canControl={canControl}
            sourceId={sourceId}
            actions={actions}
            offerBurial={offerBurial}
          />
        )}
      </div>

      {showDeathSaves && (
        <DeathSaveTracker
          entityName={entityName}
          successes={entity.deathSaveSuccesses}
          failures={entity.deathSaveFailures}
          onChange={canControl ? handleDeathSavesChange : undefined}
        />
      )}

      {canMutate && showSecondaryActions && (
        <EntityRowSecondaryActions
          id={secondaryActionsId}
          entity={entity}
          actions={actions}
          showMoveToGrave={isLive && !offerBurial}
          anchorRef={rowRef}
          triggerRef={secondaryTriggerRef}
          onClose={handleCloseSecondaryActions}
        />
      )}

      {isSelected && (
        <RowSelectionMarker isActive={isActive} isPinned={isPinned} onTogglePin={onTogglePin} />
      )}
    </div>
  );
};

// Memoize to prevent re-renders when props haven't changed
export const DnD5eEntityRow = React.memo(DnD5eEntityRowComponent);
