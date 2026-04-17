import React, { useCallback, useState } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEncounterActions } from "src/pages/EncounterManager/services/dnd5e/DnD5eEncounterActions.js";
import InlineEditableNumber from "src/components/InlineEditableNumber/InlineEditableNumber.js";
import { LiveHpActionControl } from "./LiveHpActionControl.js";
import styles from "./DnD5eEntityRow.module.css";

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

  const handleAcChange = useCallback((newAc: number) => {
    // TODO: Implement setAc action when available
    console.log("AC change not yet implemented", newAc);
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

  const handleQuickDamage = useCallback((amount: number) => {
    if (!canMutate || sourceId === undefined) {
      return;
    }

    actions.hp.damage(sourceId, entity.instanceId, amount);
  }, [actions.hp, canMutate, entity.instanceId, sourceId]);

  const handleQuickHeal = useCallback((amount: number) => {
    if (!canMutate || sourceId === undefined) {
      return;
    }

    actions.hp.heal(sourceId, entity.instanceId, amount);
  }, [actions.hp, canMutate, entity.instanceId, sourceId]);

  const handleLiveInitiative = useCallback(() => {
    if (!canMutate) {
      return;
    }

    const rawValue = window.prompt(`Set initiative for ${entity.displayName ?? entity.name}:`, String(entity.initiative));
    if (!rawValue) {
      return;
    }

    const initiative = Number(rawValue);
    if (!Number.isFinite(initiative)) {
      return;
    }

    actions.stats.setInitiative(entity.instanceId, Math.floor(initiative));
  }, [actions.stats, canMutate, entity.displayName, entity.initiative, entity.instanceId, entity.name]);

  return (
    <div
      className={`${styles.entityRow}${isActive ? ' ' + styles.active : ''}${isSelected ? ' ' + styles.selected : ''}`}
      onClick={handleSelectRow}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelectRow();
        }
      }}
    >
      {/* Top Row: Name, Type, and Remove */}
      <div className={styles.entityRowTop}>
        <div className={styles.entityNameSection}>
          <h3>{entity.displayName ?? entity.name}</h3>
          <span className={styles.entityType}>{entity.entityType}</span>
        </div>
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

      {/* Middle Row: Core Stats */}
      <div className={styles.entityRowMiddle}>
        <div className={styles.entityStatsCompact}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Init</span>
            {(mode === "edit" || (mode === "live" && canMutate)) && actions ? (
              <InlineEditableNumber
                value={entity.initiative}
                onChange={handleInitiativeChange}
                min={-10}
                max={50}
                className={styles.statValue}
              />
            ) : (
              <span className={styles.statValue}>{entity.initiative}</span>
            )}
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}> HP </span>
            {mode === "edit" && actions ? (
              <InlineEditableNumber
                value={entity.maxHp}
                onChange={handleMaxHpChange}
                min={1}
                max={9999}
                className={styles.statValue}
              />
            ) : mode === "live" && actions ? (
              <div className={styles.hpLiveDisplay}>
                {canMutate ? (
                  <InlineEditableNumber
                    value={entity.currentHp}
                    onChange={handleCurrentHpChange}
                    min={0}
                    max={9999}
                    className={`${styles.statValue} ${styles.hpCurrent}`}
                  />
                ) : (
                  <span className={`${styles.statValue} ${styles.hpCurrent}`}>{entity.currentHp}</span>
                )}
                <span className={styles.hpSeparator}>/</span>
                <span className={`${styles.statValue} ${styles.hpMax}`}>{entity.maxHp}</span>
              </div>
            ) : (
              <span className={styles.statValue}>
                {entity.currentHp} / {entity.maxHp}
              </span>
            )}
          </div>
          {entity.tempHp > 0 && mode === "live" && (
            <>
              <div className={styles.statDivider}></div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Temp</span>
                <span className={styles.statValue}>{entity.tempHp}</span>
              </div>
            </>
          )}
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>AC</span>
            {mode === "edit" && actions ? (
              <InlineEditableNumber
                value={entity.ac}
                onChange={handleAcChange}
                min={1}
                max={99}
                className={styles.statValue}
              />
            ) : (
              <span className={styles.statValue}>{entity.ac}</span>
            )}
          </div>
        </div>

        {entity.conditions && entity.conditions.length > 0 && (
          <div className={styles.entityConditions}>
            <strong>Conditions:</strong> {entity.conditions.map(c => c.name).join(", ")}
          </div>
        )}
      </div>

      {/* Bottom Row: Actions - only shown in live mode */}
      {mode === "live" && (
        <div className={styles.entityRowBottom}>
          <div className={styles.entityActions}>
            <LiveHpActionControl
              entityName={entity.displayName ?? entity.name}
              disabled={!canMutate || sourceId === undefined}
              onDamage={handleQuickDamage}
              onHeal={handleQuickHeal}
            />

            <button className={styles.actionButton} disabled title="Coming soon">
              Condition
            </button>
            <button
              className={styles.actionButton}
              onClick={handleLiveInitiative}
              disabled={!canMutate}
              title={canMutate ? "Set initiative" : "Only the GM can modify entities"}
            >
              Initiative
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when props haven't changed
export const DnD5eEntityRow = React.memo(DnD5eEntityRowComponent);
