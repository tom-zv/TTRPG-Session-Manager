import React from "react";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { useLiveEncounter } from "src/pages/EncounterManager/hooks/useLiveEncounter.js";

type LiveEncounterProps = {
  system: SystemType;
  encounterId: number;
  onExit: () => void;
};

export const LiveEncounter: React.FC<LiveEncounterProps> = ({ system, encounterId, onExit }) => {
  

  const { encounter, isLoading, socketService } = useLiveEncounter(system, encounterId);

  

  
};
