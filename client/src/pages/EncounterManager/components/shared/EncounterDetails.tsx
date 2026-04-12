import React from "react";
import { CoreEncounter } from "shared/domain/encounters/coreEncounter.js";
import styles from "./EncounterDetails.module.css";

interface EncounterDetailsProps {
  encounter: CoreEncounter;
}

export const EncounterDetails: React.FC<EncounterDetailsProps> = ({ encounter }) => {
    return (
        <>
          <div className={styles.encounterDetails}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Status:</span>
              <span className={styles.statValue}>{encounter.status}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Difficulty:</span>
              <span className={styles.statValue}>{encounter.difficulty}</span>
            </div>
            {encounter.location && (
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Location:</span>
                <span className={styles.statValue}>{encounter.location}</span>
              </div>
            )}
          </div>
        </>
    );
}