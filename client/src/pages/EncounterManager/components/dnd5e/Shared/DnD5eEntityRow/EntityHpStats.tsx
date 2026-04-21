import React from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import InlineEditableNumber from "src/components/InlineEditableNumber/InlineEditableNumber.js";
import styles from "./DnD5eEntityRow.module.css";

type EntityHpStatsProps = {
  entity: DnD5eEntity;
  mode: "edit" | "live";
  canMutate: boolean;
  onMaxHpChange: (value: number) => void;
  onCurrentHpChange: (value: number) => void;
};

export const EntityHpStats: React.FC<EntityHpStatsProps> = ({
  entity,
  mode,
  canMutate,
  onMaxHpChange,
  onCurrentHpChange,
}) => {
  return (
    <div className={styles.entityStatsCompact}>
      <div className={`${styles.statItem} ${styles.statItemHp}`}>
        <span className={styles.statLabel}>HP</span>
        {mode === "edit" ? (
          <InlineEditableNumber
            value={entity.maxHp}
            onChange={onMaxHpChange}
            min={1}
            max={9999}
            className={styles.statValue}
          />
        ) : canMutate ? (
          <div className={styles.hpLiveDisplay}>
            <InlineEditableNumber
              value={entity.currentHp}
              onChange={onCurrentHpChange}
              min={0}
              max={9999}
              className={`${styles.statValue} ${styles.hpCurrent}`}
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
