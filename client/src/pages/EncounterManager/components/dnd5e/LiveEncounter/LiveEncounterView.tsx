import React, { useCallback, useMemo, useState } from "react";
import { GiWarlockEye } from "react-icons/gi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { useLiveEncounter } from "src/pages/EncounterManager/hooks/useLiveEncounter.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useOrderedEntities } from "src/pages/EncounterManager/hooks/dnd5e/useOrderedEntities.js";
import { useEntitySelection } from "src/pages/EncounterManager/hooks/dnd5e/useEntitySelection.js";
import { TurnDock } from "./TurnDock.js";
import { EncounterSettingsPanel } from "./EncounterSettingsPanel.js";
import { GraveSection } from "../Shared/GraveSection/GraveSection.js";
import { InlineConfirm } from "../Shared/DnD5eEntityRow/InlineConfirm.js";
import styles from "./LiveEncounterView.module.css";
import linkStyles from "../Shared/SelectionLink.module.css";
import layoutStyles from "../../shared/EncounterLayout.module.css";
import { DnD5eEntityList } from "../Shared/DnD5eEntityList.js";
import { DnD5eEntityCard } from "../Shared/DnD5eEntityCard/DnD5eEntityCard.js";
import { Group, Panel, Separator } from "react-resizable-panels";

type LiveEncounterProps = {
  system: SystemType;
  encounterId: number;
  isGm: boolean;
  onExit: () => void;
};

export const LiveEncounter: React.FC<LiveEncounterProps> = ({
  system,
  encounterId,
  isGm,
  onExit,
}) => {
  const { currentUser } = useAuth();
  const {
    encounter,
    isLoading,
    isLifecycleReady,
    lifecycleError,
    encounterEnded,
    lastOperation,
    actions,
  } = useLiveEncounter(system, encounterId, { isGm });

  const hasDataError = !isLoading && !encounter;
  const isBootstrapping = isLoading || !isLifecycleReady || !actions;
  const canMutate = isGm && isLifecycleReady && !encounterEnded;
  const sourceId = currentUser?.id;

  const [userSelectedEntityId, setUserSelectedEntityId] = useState<number | undefined>();
  const [isPinned, setIsPinned] = useState(false);
  // Tracks the round+turn at which the user last clicked a row.
  // The peek expires when either value changes, so wrap-around to the same
  // turn index in a later round does not falsely reactivate the peek.
  const [peekAt, setPeekAt] = useState<{ round: number; turn: number } | undefined>();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const orderedEntities = useOrderedEntities(
    encounter?.entities ?? [],
    encounter?.initiativeOrder ?? []
  );
  const graveEntities = useMemo(
    () => encounter?.entities.filter((entity) => entity.inGrave) ?? [],
    [encounter?.entities]
  );
  // Grave members stay selectable (and pinnable) so the side card can show them.
  const selectableEntities = useMemo(
    () => [...orderedEntities, ...graveEntities],
    [orderedEntities, graveEntities]
  );

  const activeEntity = encounter?.entities.find((entity) => entity.instanceId === encounter.initiativeOrder[encounter.currentTurn]);
  const currentTurnIndex = encounter?.currentTurn;
  const currentRound = encounter?.currentRound;

  // Peek is valid only for the exact round+turn at which the user clicked.
  // Using both values ensures wrap-around (same turn index, later round) doesn't
  // falsely reactivate a stale peek.
  const isPeekValid =
    peekAt !== undefined &&
    peekAt.round === currentRound &&
    peekAt.turn === currentTurnIndex;
  const pinnedEntityStillActive = selectableEntities.some((entity) => entity.instanceId === userSelectedEntityId);
  const effectiveIsPinned = isPinned && pinnedEntityStillActive;
  // Clear a lost selection before committing the render, so a later restoration
  // cannot accidentally reactivate an old pin.
  if (encounter && userSelectedEntityId !== undefined && !pinnedEntityStillActive) {
    setIsPinned(false);
    setUserSelectedEntityId(undefined);
    setPeekAt(undefined);
  }
  const effectiveUserSelectedId = effectiveIsPinned
    ? userSelectedEntityId
    : (isPeekValid ? userSelectedEntityId : undefined);

  const selectedEntityId = useEntitySelection(
    selectableEntities,
    effectiveUserSelectedId,
    activeEntity?.instanceId
  );

  const selectedEntity = selectableEntities.find((entity) => entity.instanceId === selectedEntityId);
  const activeEntityName = activeEntity?.name ?? "No active entity";

  const handleSelectEntity = useCallback((entityId: number) => {
    setUserSelectedEntityId(entityId);
    if (!effectiveIsPinned) {
      setIsPinned(false);
      // Record the current round+turn so the peek expires when either changes.
      if (currentTurnIndex !== undefined && currentRound !== undefined) {
        setPeekAt({ round: currentRound, turn: currentTurnIndex });
      }
    }
    // If already pinned, clicking another row just moves the pin target.
  }, [effectiveIsPinned, currentTurnIndex, currentRound]);

  const handleTogglePin = useCallback(() => {
    if (!effectiveIsPinned) {
      // Pinning: lock the currently displayed entity across turns.
      setUserSelectedEntityId(selectedEntityId);
      setPeekAt(undefined);
      setIsPinned(true);
    } else {
      // Unpinning: snap back to the active turn entity.
      setUserSelectedEntityId(undefined);
      setPeekAt(undefined);
      setIsPinned(false);
    }
  }, [effectiveIsPinned, selectedEntityId]);
  const nextTurnDisabled = !canMutate || !encounter || encounter.initiativeOrder.length === 0;
  const deathAnnouncement = lastOperation?.appliedEvents.flatMap((event) => {
    if (event.type !== "moveToGrave" && event.type !== "restoreFromGrave") return [];
    const entity = encounter?.entities.find((candidate) => candidate.instanceId === event.values.targetId);
    const name = entity?.displayName ?? entity?.name ?? "Entity";
    return [`${name} ${event.type === "moveToGrave" ? "moved to the grave" : "returned to initiative"}.`];
  }).join(" ");

  const handleNextTurn = () => {
    if (!canMutate || !encounter || !actions) return;
    actions.global.nextTurn();
  };

  const handleResetEncounter = () => {
    setConfirmingReset(false);
    if (!canMutate || !encounter || !actions) return;
    actions.global.resetEncounter();
  };

  return (
    <div className="page-container">
      <div className={`${layoutStyles.encounterShell} ${styles.liveEncounterShell}`}>
        <div className={`${layoutStyles.encounterHeader} ${styles.stickyEncounterHeader}`}>
          <div className={layoutStyles.encounterTitle}>
            <h1>
              {encounter?.name ||
                (hasDataError
                  ? "Error Loading Encounter"
                  : "Loading Encounter...")}
            </h1>
          </div>
          <div className={layoutStyles.encounterHeaderActions}>
            {isGm && encounter && actions && (
              <EncounterSettingsPanel settings={encounter.settings} actions={actions} canMutate={canMutate} />
            )}
            {confirmingReset && canMutate ? (
              <InlineConfirm
                label="Reset encounter?"
                confirmLabel="Confirm reset: return everyone from the grave, reset round and turn, and restore all HP"
                cancelLabel="Cancel reset"
                onConfirm={handleResetEncounter}
                onCancel={() => setConfirmingReset(false)}
                className={styles.resetConfirm}
              />
            ) : (
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => setConfirmingReset(true)}
                disabled={
                  !canMutate || !encounter || encounter.entities.length === 0
                }
                title={
                  canMutate
                    ? "Reset round and turn, return everyone from the grave, and restore HP to max"
                    : "Only the GM can reset encounters"
                }
              >
                reset
              </button>
            )}
            <button onClick={onExit}>Exit Encounter</button>
          </div>
        </div>

        {lifecycleError && (
          <p role="alert" className={styles.liveMessageError}>
            Live connection error: {lifecycleError}
          </p>
        )}

        {encounterEnded && (
          <p role="status" className={styles.liveMessageStatus}>
            This live encounter has ended.
          </p>
        )}

        {/* Kept mounted so screen readers pick up each change; the grave itself is the visual cue. */}
        <p role="status" aria-live="polite" className={styles.srOnly}>{deathAnnouncement}</p>

        {hasDataError ? (
          <div className={layoutStyles.encounterLoading}>
            <p>Failed to load encounter data.</p>
          </div>
        ) : isBootstrapping ? (
          <div className={layoutStyles.encounterLoading}>
            <p>Connecting to live encounter...</p>
          </div>
        ) : (
          <Group
            orientation="horizontal"
            className={`${layoutStyles.encounterPanels} ${styles.panelsLocked}`}
          >
            <Panel
              defaultSize={72}
              minSize={20}
              className={`${layoutStyles.panelMinHeight} ${styles.entityListPanel}`}
            >
              {/* <EncounterDetails encounter={encounter!} /> */}
              <DnD5eEntityList
                entities={encounter!.entities}
                initiativeOrder={encounter!.initiativeOrder}
                currentTurn={encounter!.currentTurn}
                mode="live"
                actions={actions}
                canMutate={canMutate}
                sourceId={sourceId}
                selectedEntityId={selectedEntityId}
                onSelectEntity={handleSelectEntity}
                isPinned={effectiveIsPinned}
                onTogglePin={handleTogglePin}
                topAdornment={
                  <TurnDock
                    currentRound={encounter!.currentRound}
                    activeEntityName={activeEntityName}
                    onNextTurn={handleNextTurn}
                    disabled={nextTurnDisabled}
                    canMutate={canMutate}
                  />
                }
                bottomAdornment={
                  <GraveSection
                    encounterId={encounterId}
                    entities={graveEntities}
                    actions={actions}
                    canMutate={canMutate}
                    selectedEntityId={selectedEntityId}
                    isPinned={effectiveIsPinned}
                    onTogglePin={handleTogglePin}
                    onSelectEntity={handleSelectEntity}
                  />
                }
              />
            </Panel>

            <Separator className={layoutStyles.panelResizeHandle} />

            <Panel
              defaultSize={28}
              minSize={28}
              className={
                selectedEntity
                  ? layoutStyles.sidePanel
                  : layoutStyles.panelMinHeight
              }
            >
              <aside className={layoutStyles.sidePanelContent}>
                <div className={linkStyles.sidepanelSelectionAnchor}>
                  {selectedEntity && (
                    <div
                      className={`${linkStyles.selectionMarker} ${linkStyles.sidepanelSelectionMarker}`}
                      aria-hidden="true"
                    >
                      <GiWarlockEye />
                    </div>
                  )}
                  <div className={styles.sidePanelCardContainer}>
                    {selectedEntity && (
                      <button
                        className={`${styles.pinButton}${effectiveIsPinned ? " " + styles.pinButtonActive : ""}`}
                        onClick={handleTogglePin}
                        title={
                          effectiveIsPinned
                            ? "Pinned — click to follow active turn"
                            : "Following active turn — click to pin"
                        }
                        aria-label={
                          effectiveIsPinned
                            ? "Unpin entity: return to following active turn"
                            : "Pin entity: keep in sidebar across turns"
                        }
                      >
                        {effectiveIsPinned ? <BsPinAngleFill /> : <BsPinAngle />}
                      </button>
                    )}
                    <DnD5eEntityCard
                      entity={selectedEntity}
                      className={
                        selectedEntity ? linkStyles.linkedEntityCard : undefined
                      }
                    />
                  </div>
                </div>
              </aside>
            </Panel>
          </Group>
        )}
      </div>
    </div>
  );
};
