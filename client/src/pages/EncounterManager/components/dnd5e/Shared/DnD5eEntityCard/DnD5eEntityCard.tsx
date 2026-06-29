import React from "react";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  AbilityGrid,
  EntityEntrySections,
  EntityHeader,
  EntityInfoBlock,
  StatSummary,
} from "./DnD5eEntityCardSections.js";
import styles from "./DnD5eEntityCard.module.css";

type DnD5eEntityCardProps = {
  entity?: DnD5eEntityDetails;
  className?: string;
  /** Show only who this is, for viewers who are not given the stat block. */
  redactedName?: string;
};

const DnD5eEntityCardComponent: React.FC<DnD5eEntityCardProps> = ({
  entity,
  className,
  redactedName,
}) => {
  const cardClassName = `${styles.entityCard}${className ? " " + className : ""}`;

  if (redactedName !== undefined) {
    return (
      <div className={cardClassName}>
        <p><strong>{redactedName}</strong></p>
        <p>Only the GM sees the details of this entity.</p>
      </div>
    );
  }

  if (!entity) {
    return <div className={cardClassName}>No entity selected.</div>;
  }

  return (
    <div className={cardClassName}>
      <EntityHeader entity={entity} />
      <StatSummary entity={entity} />
      <AbilityGrid entity={entity} />
      <EntityInfoBlock entity={entity} />
      <EntityEntrySections entity={entity} />
    </div>
  );
};

DnD5eEntityCardComponent.displayName = "DnD5eEntityCard";

export const DnD5eEntityCard = React.memo(DnD5eEntityCardComponent);
