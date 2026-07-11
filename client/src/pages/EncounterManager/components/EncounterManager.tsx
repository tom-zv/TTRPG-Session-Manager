import React, { useState } from "react";
import EncounterListView from "./EncounterListView/EncounterListView.js";
import { useDataSummaries } from "../hooks/useDataSummaries.js";
import {
  supportedSystems,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";

export const EncounterManager: React.FC = () => {
  const [system, setSystem] = useState<SystemType>(supportedSystems[0]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);
  const { encounterSummaries } = useDataSummaries(system);
  const { currentUser } = useAuth();
  const isGm = Boolean(currentUser?.isGm);

  return selectedEncounterId === null ? (
    <EncounterListView
      system={system}
      setSystem={setSystem}
      onOpen={setSelectedEncounterId}
      encounterSummaries={encounterSummaries}
      isGm={isGm}
    />
  ) : (
    <LiveEncounter
      system={system}
      encounterId={selectedEncounterId}
      isGm={isGm}
      onExit={() => setSelectedEncounterId(null)}
    />
  );
};
