import React, { useCallback, useState } from "react";
import { GiWarlockEye } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import InlineEditableNumber from "src/components/InlineEditableNumber/InlineEditableNumber.js";
import { EntityHpStats } from "./EntityHpStats.js";
import { EntityRowLiveActions } from "./EntityRowLiveActions.js";
import styles from "./DnD5eEntityRow.module.css";
import linkStyles from "../SelectionLink.module.css";

type DnD5eEntityRowProps = {
  entity: DnD5eEntity;
  isActive: boolean;
  isSelected?: boolean;
  mode: "edit" | "live";
  actions: DnD5eEncounterActions;
  onRemove: (entityId: number) => void;
  canMutate?: boolean;
  sourceId?: number;
  onSelect?: (entityId: number) => void;
};

const DnD5eEntityRowComponent: React.FC<DnD5eEntityRowProps> = ({
  entity,
  isActive,
  isSelected = false,
  mode,
  actions,
  onRemove,
  canMutate = true,
  sourceId,
  onSelect,
}) => {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showSecondaryActions, setShowSecondaryActions] = useState(false);

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRemoveConfirm(true);
  }, []);

  const handleConfirmRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(entity.instanceId);
    setShowRemoveConfirm(false);
  }, [entity.instanceId, onRemove]);

  const handleCancelRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRemoveConfirm(false);
  }, []);

  const handleToggleSecondaryActions = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowSecondaryActions((previous) => !previous);
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

  const handleSelectRow = useCallback(() => {
    onSelect?.(entity.instanceId);
  }, [onSelect, entity.instanceId]);

  const conditionNames = entity.conditions?.map((condition) => condition.name).join(", ");
  const hasConditions = Boolean(conditionNames);

  return (
    <div
      className={`${styles.entityRow}${isActive ? ' ' + styles.active : ''}${isSelected ? ' ' + styles.selected : ''}`}
      onClick={handleSelectRow}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-expanded={mode === "live" ? showSecondaryActions : undefined}
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
        {/* <span className={styles.initiativeTabLabel}>Init</span> */}
        {(mode === "edit" || (mode === "live" && canMutate)) && actions ? (
          <InlineEditableNumber
            value={entity.initiative}
            onChange={handleInitiativeChange}
            min={-10}
            max={50}
            className={`${styles.statValue} ${styles.initiativeTabValue}`}
          />
        ) : (
          <span className={`${styles.statValue} ${styles.initiativeTabValue}`}>{entity.initiative}</span>
        )}
      </div>

      <div className={styles.entityRowTop}>
        <div className={styles.entityIdentity}>
          <h3 className={styles.entityName}>{entity.displayName ?? entity.name}</h3>
        </div>
        <div className={styles.topControls}>
          
          {mode === "edit" && showRemoveConfirm ? (
            <div className={styles.entityRemoveConfirm}>
              <span className={styles.confirmText}>Remove?</span>
              <button
                className={`${styles.confirmButton} ${styles.confirmYes}`}
                onClick={handleConfirmRemove}
                title="Confirm removal"
                aria-label="Confirm remove entity"
              >
                ✓
              </button>
              <button
                className={`${styles.confirmButton} ${styles.confirmNo}`}
                onClick={handleCancelRemove}
                title="Cancel"
                aria-label="Cancel remove entity"
              >
                ✕
              </button>
            </div>
          ) : mode === "edit" ? (
            <button
              className={styles.entityRemoveButton}
              onClick={handleRemoveClick}
              title={`Remove ${entity.name}`}
              aria-label={`Remove ${entity.name} from encounter`}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.entityRowContent}>
        <EntityHpStats
          entity={entity}
          mode={mode}
          canMutate={canMutate}
          onMaxHpChange={handleMaxHpChange}
          onCurrentHpChange={handleCurrentHpChange}
        />

        {hasConditions && (
          <div className={styles.entityConditions}>
            <strong>Conditions:</strong> {conditionNames}
          </div>
        )}

        {mode === "live" && (
          <EntityRowLiveActions
            entity={entity}
            canMutate={canMutate}
            sourceId={sourceId}
            actions={actions}
            showSecondaryActions={showSecondaryActions}
            onToggleSecondary={handleToggleSecondaryActions}
          />
        )}
      </div>
      {isSelected && (
        <span
          className={`${linkStyles.selectionMarker} ${linkStyles.rowSelectionMarker}${isActive ? ' ' + linkStyles.activeSelectionMarker : ''}`}
          aria-hidden="true"
        >
          <GiWarlockEye />
        </span>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when props haven't changed
export const DnD5eEntityRow = React.memo(DnD5eEntityRowComponent);
