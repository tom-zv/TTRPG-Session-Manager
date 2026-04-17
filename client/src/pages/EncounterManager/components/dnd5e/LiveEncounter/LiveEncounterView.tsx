import React, { useMemo, useState } from "react";
import { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { useLiveEncounter } from "src/pages/EncounterManager/hooks/useLiveEncounter.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import styles from "./LiveEncounterView.module.css";
import layoutStyles from "../../shared/EncounterLayout.module.css";
import { DnD5eEntityList } from "../Shared/DnD5eEntityList.js";
import { DnD5eEntityCard } from "../Shared/DnD5eEntityCard/DnD5eEntityCard.js";
import { EncounterDetails } from "../../shared/EncounterDetails.js";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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
    actions,
  } = useLiveEncounter(system, encounterId, { isGm });

  const hasDataError = !isLoading && !encounter;
  const isBootstrapping = isLoading || !isLifecycleReady || !actions;
  const canMutate = isGm;
  const sourceId = currentUser?.id;

  const [userSelectedEntityId, setUserSelectedEntityId] = useState<number | undefined>();

  const orderedEntities = useMemo(() => {
    if (!encounter) {
      return [];
    }

    const byId = new Map(encounter.entities.map((entity) => [entity.instanceId, entity]));
    const initiativeSet = new Set(encounter.initiativeOrder);
    const ordered = encounter.initiativeOrder
      .map((id) => byId.get(id))
      .filter((entity): entity is DnD5eEntity => entity !== undefined);

    encounter.entities.forEach((entity) => {
      if (!initiativeSet.has(entity.instanceId)) {
        ordered.push(entity);
      }
    });

    return ordered;
  }, [encounter]);

  const activeEntity = encounter ? orderedEntities[encounter.currentTurn] : undefined;

  const selectedEntityId = useMemo(() => {
    const isStillPresent = orderedEntities.some((entity) => entity.instanceId === userSelectedEntityId);
    if (isStillPresent) {
      return userSelectedEntityId;
    }

    return activeEntity?.instanceId ?? orderedEntities[0]?.instanceId;
  }, [activeEntity?.instanceId, orderedEntities, userSelectedEntityId]);

  const selectedEntity = orderedEntities.find((entity) => entity.instanceId === selectedEntityId);

  const handleNextTurn = () => {
    if (!canMutate || !encounter || !actions) {
      return;
    }

    actions.global.nextTurn();
  };

  return (
    <div className="page-container">
      <div className={layoutStyles.encounterShell}>
        <div className={layoutStyles.encounterHeader}>
          <div className={layoutStyles.encounterTitle}>
            <h1>
              {encounter?.name || (hasDataError ? "Error Loading Encounter" : "Loading Encounter...")}
            </h1>
            {encounter && (
              <span className={styles.roundBadge}>Round {encounter.currentRound}</span>
            )}
          </div>
          <div className={layoutStyles.encounterHeaderActions}>
            <button
              onClick={handleNextTurn}
              disabled={!canMutate || !encounter || encounter.entities.length === 0}
              title={canMutate ? "Advance to the next turn" : "Only the GM can advance turns"}
            >
              Next Turn
            </button>
            <button onClick={onExit}>Exit Encounter</button>
          </div>
        </div>

        {lifecycleError && (
          <p role="alert" className={styles.liveMessageError}>
            Live connection error: {lifecycleError}
          </p>
        )}

        {encounterEnded && (
          <p role="status" className={styles.liveMessageStatus}>This live encounter has ended.</p>
        )}

        {!isBootstrapping && encounter && (
          <div className={styles.currentTurn}>
            <h2>
              Current Turn: {activeEntity?.displayName ?? activeEntity?.name ?? "No active entity"}
            </h2>
          </div>
        )}

        {hasDataError ? (
          <div className={layoutStyles.encounterLoading}>
            <p>Failed to load encounter data.</p>
          </div>
        ) : isBootstrapping ? (
          <div className={layoutStyles.encounterLoading}>
            <p>Connecting to live encounter...</p>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className={layoutStyles.encounterPanels}>
            <Panel defaultSize={70} minSize={20} className={styles.liveEncounterMain}>
              <EncounterDetails encounter={encounter!} />
              <DnD5eEntityList
                entities={encounter!.entities}
                initiativeOrder={encounter!.initiativeOrder}
                currentTurn={encounter!.currentTurn}
                mode="live"
                actions={actions}
                canMutate={canMutate}
                sourceId={sourceId}
                selectedEntityId={selectedEntityId}
                onSelectEntity={setUserSelectedEntityId}
              />
            </Panel>

            <PanelResizeHandle className={layoutStyles.panelResizeHandle}></PanelResizeHandle>

            <Panel defaultSize={30} minSize={25} className={styles.liveEncounterSidebarPanel}>
              <aside className={styles.liveEncounterSidebar}>
                <DnD5eEntityCard entity={selectedEntity} />
              </aside>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
};
