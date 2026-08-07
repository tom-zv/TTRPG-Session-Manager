import React from "react";
import { SpellLookupStatus } from "src/pages/Compendium/components/spells/SpellLookupStatus.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  AbilityGrid,
  EntityEntrySections,
  EntityHeader,
  EntityInfoBlock,
  StatSummary,
} from "./DnD5eEntityCardSections.js";
import { fillsWideCard } from "./DnD5eEntityCard.utils.js";
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

  // Given room and enough text to fill it, the body flows into two stat-block columns. The room is
  // measured on the nearest "entity-card" container, which the view declares (the encounter side
  // panel); data-layout marks a card with enough text.
  return (
    <div className={cardClassName} data-layout={fillsWideCard(entity) ? "wide" : undefined}>
      <EntityHeader entity={entity} />
      <div className={styles.cardBody}>
        <StatSummary entity={entity} />
        <AbilityGrid entity={entity} />
        <EntityInfoBlock entity={entity} />
        <SpellLookupStatus />
        <EntityEntrySections entity={entity} />
      </div>
    </div>
  );
};

DnD5eEntityCardComponent.displayName = "DnD5eEntityCard";

export const DnD5eEntityCard = React.memo(DnD5eEntityCardComponent);
