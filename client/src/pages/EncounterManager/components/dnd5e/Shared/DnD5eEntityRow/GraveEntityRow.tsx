import React, { useCallback, useId, useRef, useState } from "react";
import { GiHeartBeats, GiTombstone } from "react-icons/gi";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { usesDeathSaves } from "shared/domain/encounters/dnd5e/settings.js";
import type { HpDisplay } from "shared/domain/encounters/dnd5e/view.js";
import { EntityHpStats } from "./EntityHpStats.js";
import { DeathSaveTracker } from "./DeathSaveTracker.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { RestoreFromGraveControl } from "./RestoreFromGraveControl.js";
import { RowSelectionMarker } from "./RowSelectionMarker.js";
import { RowTray } from "../RowTray/RowTray.js";
import { isFromNestedControl } from "./rowEvents.js";
import styles from "./DnD5eEntityRow.module.css";

type GraveEntityRowProps = {
  entity: DnD5eEntity;
  canMutate: boolean;
  hpDisplay: HpDisplay;
  isSelected?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onSelect?: (entityId: number) => void;
  onRestore: (entityId: number, hp: number) => void;
  onRemove: (entityId: number) => void;
};

const noop = () => {};

/** An entity row as it appears in the grave: muted, out of initiative, restorable. */
const GraveEntityRowComponent: React.FC<GraveEntityRowProps> = ({
  entity,
  canMutate,
  hpDisplay,
  isSelected = false,
  isPinned,
  onTogglePin,
  onSelect,
  onRestore,
  onRemove,
}) => {
  const [panel, setPanel] = useState<"none" | "restore" | "remove">("none");
  const rowRef = useRef<HTMLDivElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const restoreTrayId = useId();
  const entityName = entity.displayName ?? entity.name;
  const showDeathSaves = hpDisplay === "exact" && usesDeathSaves(entity) &&
    (entity.deathSaveSuccesses > 0 || entity.deathSaveFailures > 0);

  const handleSelectRow = useCallback(() => {
    onSelect?.(entity.instanceId);
  }, [onSelect, entity.instanceId]);

  // The confirmation's controls unmount on close; keep keyboard focus on the row.
  const closePanel = useCallback(() => {
    setPanel("none");
    rowRef.current?.focus();
  }, []);

  // The restore picker opens in a tray beside the row; its button stays, so focus goes back there.
  const closeRestore = useCallback((returnFocus: boolean) => {
    setPanel("none");
    if (returnFocus) restoreButtonRef.current?.focus();
  }, []);

  return (
    <div
      ref={rowRef}
      className={`${styles.entityRow} ${styles.graveRow}${isSelected ? ` ${styles.selected}` : ""}${panel === "restore" ? ` ${styles.trayOpen}` : ""}`}
      onClick={(event) => {
        if (!isFromNestedControl(event)) handleSelectRow();
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${entityName}, in the grave`}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelectRow();
        }
      }}
    >
      <div className={`${styles.initiativeTab} ${styles.graveTab}`} aria-hidden="true">
        <GiTombstone />
      </div>

      <div className={styles.entityRowTop}>
        <div className={styles.entityIdentity}>
          <h3 className={styles.entityName}>{entityName}</h3>
          <span className={styles.entityType}>{entity.role}</span>
        </div>
        <div className={styles.topControls}>
          {canMutate && panel === "remove" ? (
            <InlineConfirm
              label="Remove from encounter?"
              confirmLabel={`Permanently remove ${entityName} from this encounter`}
              onConfirm={() => {
                setPanel("none");
                onRemove(entity.instanceId);
              }}
              onCancel={closePanel}
            />
          ) : canMutate ? (
            <>
              <button
                ref={restoreButtonRef}
                type="button"
                className={`${styles.actionButton} ${styles.restoreButton}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPanel((current) => (current === "restore" ? "none" : "restore"));
                }}
                aria-haspopup="dialog"
                aria-expanded={panel === "restore"}
                aria-controls={panel === "restore" ? restoreTrayId : undefined}
                title={`Return ${entityName} to initiative`}
                aria-label={`Restore ${entityName} to initiative`}
              >
                <GiHeartBeats aria-hidden="true" />
                Restore
              </button>
              <button
                type="button"
                className={styles.entityRemoveButton}
                onClick={(event) => {
                  event.stopPropagation();
                  setPanel("remove");
                }}
                title={`Remove ${entityName} from the encounter`}
                aria-label={`Remove ${entityName} from the encounter`}
              >
                ✕
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.entityRowContent}>
        <EntityHpStats
          entity={entity}
          mode="live"
          canMutate={false}
          canControl={false}
          hpDisplay={hpDisplay}
          onMaxHpChange={noop}
          onCurrentHpChange={noop}
        />
        {showDeathSaves && (
          <DeathSaveTracker
            entityName={entityName}
            successes={entity.deathSaveSuccesses}
            failures={entity.deathSaveFailures}
          />
        )}
      </div>

      {canMutate && panel === "restore" && (
        <RowTray
          id={restoreTrayId}
          label={`Restore ${entityName} to initiative`}
          anchorRef={rowRef}
          triggerRef={restoreButtonRef}
          onClose={closeRestore}
          focusFirstControl={false}
          size="wide"
        >
          <RestoreFromGraveControl
            entityName={entityName}
            maxHp={entity.maxHp}
            onRestore={(hp) => {
              setPanel("none");
              onRestore(entity.instanceId, hp);
            }}
            onCancel={() => closeRestore(true)}
          />
        </RowTray>
      )}

      {isSelected && <RowSelectionMarker isActive={false} isPinned={isPinned} onTogglePin={onTogglePin} />}
    </div>
  );
};

export const GraveEntityRow = React.memo(GraveEntityRowComponent);
