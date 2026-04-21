import React from "react";
import styles from "./TurnDock.module.css";

type TurnDockProps = {
  currentRound: number;
  activeEntityName: string;
  onNextTurn: () => void;
  disabled: boolean;
  canMutate: boolean;
};

export const TurnDock: React.FC<TurnDockProps> = ({
  currentRound,
  activeEntityName,
  onNextTurn,
  disabled,
  canMutate,
}) => {
  return (
    <div className={styles.turnDock}>
      <div className={styles.turnInfoColumn}>
        <span className={styles.roundBadge}>Round {currentRound}</span>
        <span className={styles.turnContext}>Current turn: {activeEntityName}</span>
      </div>
      <button
        className={styles.nextTurnButton}
        onClick={onNextTurn}
        disabled={disabled}
        title={canMutate ? "Advance to the next turn" : "Only the GM can advance turns"}
      >
        Next Turn
      </button>
    </div>
  );
};
