import React from "react";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import styles from "./Entities.module.css";

/** Where an entity comes from: its source book, Homebrew, and Edited once an import was changed in the app. */
export const SourceBadge: React.FC<{ entity: Pick<DnD5eEntitySummary, "source" | "imported" | "locallyEdited"> }> = ({ entity }) => (
  <>
    <span className={styles.sourceBadge}>{entity.imported ? entity.source : "Homebrew"}</span>
    {entity.locallyEdited && <span className={styles.sourceBadge}>Edited</span>}
  </>
);
