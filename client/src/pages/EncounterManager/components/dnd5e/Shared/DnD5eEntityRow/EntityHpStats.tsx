import React from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { getHpStatus, HP_STATUS_LABEL, type HpDisplay } from "shared/domain/encounters/dnd5e/view.js";
import { EditableField } from "src/components/FormControls/index.js";
import styles from "./DnD5eEntityRow.module.css";

type EntityHpStatsProps = {
  entity: DnD5eEntity;
  mode: "edit" | "live";
  /** May change maximum HP while preparing (GM). */
  canMutate: boolean;
  /** May change current HP during play (GM, or the player the entity is assigned to). */
  canControl: boolean;
  /** How much of the HP this viewer is shown. AC follows it: shown only with exact numbers. */
  hpDisplay?: HpDisplay;
  onMaxHpChange: (value: number) => void;
  onCurrentHpChange: (value: number) => void;
};

export const EntityHpStats: React.FC<EntityHpStatsProps> = ({
  entity,
  mode,
  canMutate,
  canControl,
  hpDisplay = "exact",
  onMaxHpChange,
  onCurrentHpChange,
}) => {
  if (hpDisplay === "hidden") return null;

  if (hpDisplay === "status") {
    const status = getHpStatus(entity);
    return (
      <div className={styles.entityStatsCompact}>
        <div className={`${styles.statItem} ${styles.statItemHp}`}>
          <span className={styles.statLabel}>HP</span>
          <span className={`${styles.statValue} ${styles.hpStatus}`} data-status={status}>{HP_STATUS_LABEL[status]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.entityStatsCompact}>
      <div className={`${styles.statItem} ${styles.statItemHp}`}>
        <span className={styles.statLabel}>HP</span>
        {mode === "edit" && !canMutate ? (
          <div className={styles.hpLiveDisplay}>
            <span className={`${styles.statValue} ${styles.hpCurrent}`}>{entity.currentHp}</span>
            <span className={styles.hpSeparator}>/ </span>
            <span className={`${styles.statValue} ${styles.hpMax}`}>{entity.maxHp}</span>
          </div>
        ) : mode === "edit" ? (
          // Preparing: a player character may arrive below full HP, so both numbers can be set.
          // Changing the maximum also restores current HP to it.
          <div className={styles.hpLiveDisplay}>
            <EditableField
              type="number"
              value={entity.currentHp}
              onChange={onCurrentHpChange}
              min={0}
              max={entity.maxHp}
              className={`${styles.statValue} ${styles.hpCurrent}`}
              displayClassName={styles.inlineNumberDisplay}
              inputClassName={styles.inlineNumberInput}
              compact
            />
            <span className={styles.hpSeparator}>/ </span>
            <EditableField
              type="number"
              value={entity.maxHp}
              onChange={onMaxHpChange}
              min={1}
              max={9999}
              className={`${styles.statValue} ${styles.hpMax}`}
              displayClassName={styles.inlineNumberDisplay}
              inputClassName={styles.inlineNumberInput}
              compact
            />
          </div>
        ) : canControl ? (
          <div className={styles.hpLiveDisplay}>
            <EditableField
              type="number"
              value={entity.currentHp}
              onChange={onCurrentHpChange}
              min={0}
              max={9999}
              className={`${styles.statValue} ${styles.hpCurrent}`}
              displayClassName={styles.inlineNumberDisplay}
              inputClassName={styles.inlineNumberInput}
              compact
            />
            <span className={styles.hpSeparator}>/ </span>
            <span className={`${styles.statValue} ${styles.hpMax}`}>{entity.maxHp}</span>
          </div>
        ) : (
          <div className={styles.hpLiveDisplay}>
            <span className={`${styles.statValue} ${styles.hpCurrent}`}>{entity.currentHp}</span>
            <span className={styles.hpSeparator}>/ </span>
            <span className={`${styles.statValue} ${styles.hpMax}`}>{entity.maxHp}</span>
          </div>
        )}
      </div>

      {entity.tempHp > 0 && mode === "live" && (
        <div className={`${styles.statItem} ${styles.statItemTempHp}`}>
          <span className={styles.statLabel}>Temp</span>
          <span className={styles.statValue}>{entity.tempHp}</span>
        </div>
      )}

      <div className={`${styles.statItem} ${styles.statItemAc}`}>
        <span className={styles.statLabel}>AC</span>
        <span className={styles.statValue}>{entity.ac}</span>
      </div>
    </div>
  );
};
