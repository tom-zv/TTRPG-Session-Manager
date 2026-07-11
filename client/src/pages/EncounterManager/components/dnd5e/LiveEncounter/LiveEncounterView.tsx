import React, { useCallback, useMemo, useState } from "react";
import { GiWarlockEye } from "react-icons/gi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { controlsEntity, hpDisplayFor, isVisibleTo } from "shared/domain/encounters/dnd5e/view.js";
import { ToggleSwitch } from "../Shared/ToggleSwitch/ToggleSwitch.js";
import { useLiveEncounter } from "src/pages/EncounterManager/hooks/useLiveEncounter.js";
import { useDnD5eEntitySummaries } from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
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
import Dialog from "src/components/Dialog/Dialog.js";
import { EntityPicker } from "../Shared/EntityPicker/EntityPicker.js";

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
    commandError,
    encounterEnded,
    lastOperation,
    actions,
  } = useLiveEncounter(system, encounterId);

  const phase = encounter?.phase;
  const isRunning = phase === "running";
  const connectionFailed = !isLifecycleReady && lifecycleError !== null;
  const hasDataError = (isLifecycleReady && !isLoading && !encounter) || connectionFailed;
  const isBootstrapping = isLoading || !isLifecycleReady || !actions;
  const isWritable = isLifecycleReady && !encounterEnded;
  // GM powers: membership, phases, settings, the grave.
  const canMutate = isGm && isWritable;
  const sourceId = currentUser?.id;
  const viewer = useMemo(() => ({ userId: currentUser?.id, isGm }), [currentUser?.id, isGm]);
  // Running a single entity: the GM, or the player it is assigned to.
  const canControlEntity = useCallback(
    (entity: DnD5eEntity) => isWritable && controlsEntity(viewer, entity),
    [isWritable, viewer]
  );
  const [isEntityPickerOpen, setIsEntityPickerOpen] = useState(false);
  const [addHidden, setAddHidden] = useState(false);
  // Everything below draws from this list, so a hidden entity never reaches a player's screen.
  const visibleEntities = useMemo(
    () => encounter?.entities.filter((entity) => isVisibleTo(viewer, entity)) ?? [],
    [encounter?.entities, viewer]
  );
  const settings = encounter?.settings;
  const hpDisplayForEntity = useCallback(
    (entity: DnD5eEntity) => (settings ? hpDisplayFor(viewer, entity, settings) : "exact"),
    [viewer, settings]
  );

  const [userSelectedEntityId, setUserSelectedEntityId] = useState<number | undefined>();
  const [isPinned, setIsPinned] = useState(false);
  // Tracks the round+turn at which the user last clicked a row.
  // The peek expires when either value changes, so wrap-around to the same
  // turn index in a later round does not falsely reactivate the peek.
  const [peekAt, setPeekAt] = useState<{ round: number; turn: number } | undefined>();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const orderedEntities = useOrderedEntities(
    visibleEntities,
    encounter?.initiativeOrder ?? []
  );
  const graveEntities = useMemo(
    () => visibleEntities.filter((entity) => entity.inGrave),
    [visibleEntities]
  );
  // Grave members stay selectable (and pinnable) so the side card can show them.
  const selectableEntities = useMemo(
    () => [...orderedEntities, ...graveEntities],
    [orderedEntities, graveEntities]
  );

  // Nobody holds the turn before combat starts or after it ends.
  const activeEntity = isRunning
    ? encounter?.entities.find((entity) => entity.instanceId === encounter.initiativeOrder[encounter.currentTurn])
    : undefined;
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
  const activeEntityName = !activeEntity
    ? "No active entity"
    : isVisibleTo(viewer, activeEntity)
      ? activeEntity.displayName ?? activeEntity.name
      : "Hidden combatant";
  const selectedEntityIsRedacted = selectedEntity !== undefined && hpDisplayForEntity(selectedEntity) !== "exact";

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
  const canEndTurn = canMutate || (activeEntity !== undefined && canControlEntity(activeEntity));
  const nextTurnDisabled = !canEndTurn || !encounter || encounter.initiativeOrder.length === 0;
  const deathAnnouncement = lastOperation?.appliedEvents.flatMap((event) => {
    if (event.type !== "moveToGrave" && event.type !== "restoreFromGrave") return [];
    const entity = visibleEntities.find((candidate) => candidate.instanceId === event.values.targetId);
    if (!entity) return [];
    const name = entity.displayName ?? entity.name;
    return [`${name} ${event.type === "moveToGrave" ? "moved to the grave" : "returned to initiative"}.`];
  }).join(" ");

  const handleNextTurn = () => {
    if (!canEndTurn || !encounter || !actions) return;
    actions.global.nextTurn();
  };

  const handleAddEntity = (templateId: number, name: string, hp: number) => {
    setIsEntityPickerOpen(false);
    if (!canMutate || !actions) return;
    actions.global.addEntity(templateId, name, hp, addHidden);
  };

  // Party members that are not in the encounter yet.
  const { data: entitySummaries } = useDnD5eEntitySummaries({ enabled: isGm });
  const missingPartyMembers = useMemo(() => {
    const present = new Set(encounter?.entities.map((entity) => entity.templateId));
    return entitySummaries?.filter((summary) => summary.inParty && !present.has(summary.templateId)) ?? [];
  }, [entitySummaries, encounter?.entities]);

  const handleAddParty = () => {
    if (!canMutate || !actions) return;
    missingPartyMembers.forEach((member) => actions.global.addEntity(member.templateId, member.name, member.hp));
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
            {canMutate && encounter && actions && (
              <button type="button" onClick={() => setIsEntityPickerOpen(true)}>
                + Add Entity
              </button>
            )}
            {canMutate && encounter && actions && phase === "setup" && (
              <button
                type="button"
                onClick={handleAddParty}
                disabled={missingPartyMembers.length === 0}
                title={
                  missingPartyMembers.length === 0
                    ? "Every party member is already here. Mark a player character as a party member from its options."
                    : `Add ${missingPartyMembers.map((member) => member.name).join(", ")}`
                }
              >
                + Add party
              </button>
            )}
            {canMutate && encounter && actions && phase === "setup" && (
              <button
                type="button"
                onClick={() => actions.global.startCombat()}
                disabled={encounter.initiativeOrder.length === 0}
                title={
                  encounter.initiativeOrder.length === 0
                    ? "Add at least one entity before starting combat"
                    : "Begin round 1 with the current initiative order"
                }
              >
                Start combat
              </button>
            )}
            {canMutate && actions && isRunning && (
              <button
                type="button"
                onClick={() => actions.global.endCombat()}
                title="Stop advancing turns and mark the encounter as completed"
              >
                End combat
              </button>
            )}
            {!phase || phase === "setup" ? null : confirmingReset && canMutate ? (
              <InlineConfirm
                label="Reset encounter?"
                confirmLabel="Confirm reset: return to setup, return everyone from the grave, and restore all HP"
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
                    ? "Return to setup: reset round and turn, return everyone from the grave, and restore HP to max"
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
            Connection error: {lifecycleError}
          </p>
        )}

        {commandError && (
          <p role="alert" className={styles.liveMessageError}>
            Action failed: {commandError}
          </p>
        )}

        {encounterEnded && (
          <p role="status" className={styles.liveMessageStatus}>
            This encounter was deleted.
          </p>
        )}

        {phase === "ended" && !encounterEnded && (
          <p role="status" className={styles.liveMessageStatus}>
            Combat has ended.{isGm ? " Reset the encounter to run it again." : ""}
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
            <p>Connecting to encounter...</p>
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
                entities={visibleEntities}
                initiativeOrder={encounter!.initiativeOrder}
                currentTurn={isRunning ? encounter!.currentTurn : undefined}
                mode={phase === "setup" ? "edit" : "live"}
                actions={actions}
                canMutate={canMutate}
                canControlEntity={canControlEntity}
                hpDisplayFor={hpDisplayForEntity}
                sourceId={sourceId}
                selectedEntityId={selectedEntityId}
                onSelectEntity={handleSelectEntity}
                isPinned={effectiveIsPinned}
                onTogglePin={handleTogglePin}
                topAdornment={isRunning &&
                  <TurnDock
                    currentRound={encounter!.currentRound}
                    activeEntityName={activeEntityName}
                    onNextTurn={handleNextTurn}
                    disabled={nextTurnDisabled}
                    canMutate={canEndTurn}
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
                      redactedName={
                        selectedEntity && selectedEntityIsRedacted
                          ? selectedEntity.displayName ?? selectedEntity.name
                          : undefined
                      }
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

        <Dialog
          isOpen={isEntityPickerOpen}
          onClose={() => setIsEntityPickerOpen(false)}
          title="Add Entity to Encounter"
        >
          <ToggleSwitch
            checked={addHidden}
            onChange={setAddHidden}
            label="Add hidden from players"
            help="Players will not see the entity until you reveal it from its options."
          />
          <EntityPicker
            onSelect={handleAddEntity}
            onCancel={() => setIsEntityPickerOpen(false)}
            title="Select an entity to add"
          />
        </Dialog>
      </div>
    </div>
  );
};
