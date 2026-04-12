import React, { useState } from "react";
import EncounterListView from "./EncounterListView/EncounterListView.js";
import EncounterEditor from "./dnd5e/EncounterEditor/EncounterEditorView.js";
import { useDataSummaries } from "../hooks/useDataSummaries.js";
import {
  supportedSystems,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";

export const EncounterManager: React.FC = () => {
  const [system, setSystem] = useState<SystemType>(supportedSystems[0]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(
    null
  );
  const [isLive, setIsLive] = useState<boolean>(false);
  const { encounterSummaries } = useDataSummaries(system);
  const { currentUser } = useAuth();

  return selectedEncounterId === null ? (
    <EncounterListView
      system={system}
      setSystem={setSystem}
      onOpenEditor={(encounterId) => setSelectedEncounterId(encounterId)}
      onLaunchLive={(encounterId) => {
        setSelectedEncounterId(encounterId);
        setIsLive(true);
      }}
      encounterSummaries={encounterSummaries}
      setIsLive={setIsLive}
    />
  ) : isLive ? (
    <LiveEncounter
      encounterId={selectedEncounterId}
      onExit={() => {
        setSelectedEncounterId(null);
        setIsLive(false)
      }}
    />
  ) : (
    <EncounterEditor
      encounterId={selectedEncounterId}
      onExit={() => setSelectedEncounterId(null)}
      isGm={currentUser?.isGm ?? false}
    />
  );
};

//TODO:
// - Init change animation
// -
