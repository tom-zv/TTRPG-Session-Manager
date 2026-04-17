import React, { useCallback, useMemo, useState } from "react";
import { GiCrocSword, GiHealthIncrease } from "react-icons/gi";
import styles from "./LiveHpActionControl.module.css";

type LiveHpActionControlProps = {
  entityName: string;
  disabled: boolean;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
};

export const LiveHpActionControl: React.FC<LiveHpActionControlProps> = ({
  entityName,
  disabled,
  onDamage,
  onHeal,
}) => {
  const [amountValue, setAmountValue] = useState("5");

  const parsedAmount = useMemo(() => {
    const value = Number(amountValue);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.floor(value);
  }, [amountValue]);

  const isActionDisabled = disabled || parsedAmount === null;

  const handleDamage = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (parsedAmount === null || disabled) {
      return;
    }

    onDamage(parsedAmount);
  }, [disabled, onDamage, parsedAmount]);

  const handleHeal = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (parsedAmount === null || disabled) {
      return;
    }

    onHeal(parsedAmount);
  }, [disabled, onHeal, parsedAmount]);

  return (
    <div className={styles.hpQuickActions} role="group" aria-label={`Quick HP actions for ${entityName}`}>
      <div className={styles.hpAmountWrapper}>
        <input
          className={styles.hpAmountInput}
          type="number"
          min={1}
          step={1}
          value={amountValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setAmountValue(e.target.value)}
          aria-label="HP amount"
        />
        <span className={styles.hpAmountHint}>HP</span>
      </div>
      <div className={styles.hpActionButtons}>
        <button
          type="button"
          className={`${styles.hpActionButton} ${styles.damageButton}`}
          onClick={handleDamage}
          disabled={isActionDisabled}
          title={`Deal damage to ${entityName}`}
          aria-label={`Deal damage to ${entityName}`}
        >
          <GiCrocSword />
        </button>
        <button
          type="button"
          className={`${styles.hpActionButton} ${styles.healButton}`}
          onClick={handleHeal}
          disabled={isActionDisabled}
          title={`Heal ${entityName}`}
          aria-label={`Heal ${entityName}`}
        >
          <GiHealthIncrease />
        </button>
      </div>
    </div>
  );
};
