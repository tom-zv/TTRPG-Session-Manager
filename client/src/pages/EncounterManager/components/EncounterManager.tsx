import React, { useEffect, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import EncounterListView from "./EncounterListView/EncounterListView.js";
import { useDataSummaries } from "../hooks/useDataSummaries.js";
import {
  supportedSystems,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";

const LIST_PATH = "/encounter-manager";
const encounterPath = (encounterId: number) => `${LIST_PATH}/${encounterId}`;

/**
 * The encounter list at /encounter-manager and one encounter at /encounter-manager/:encounterId,
 * so an encounter survives a reload and its address can be given to players.
 *
 * Pages stay mounted while the user visits another one (see AppLayout). An open encounter is
 * therefore kept, still connected, while the user is elsewhere, for example starting music in the
 * sound manager, and coming back through the navigation bar returns to it.
 */
export const EncounterManager: React.FC = () => {
  const [system, setSystem] = useState<SystemType>(supportedSystems[0]);
  const { encounterSummaries } = useDataSummaries(system);
  const { currentUser } = useAuth();
  const isGm = Boolean(currentUser?.isGm);

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const match = useMatch(`${LIST_PATH}/:encounterId`);
  const idFromUrl = Number(match?.params.encounterId);
  const urlEncounterId = Number.isInteger(idFromUrl) && idFromUrl > 0 ? idFromUrl : null;
  const isOnThisPage = pathname === LIST_PATH || pathname.startsWith(`${LIST_PATH}/`);

  // While this page is showing, the address decides which encounter is open. While the user is
  // on another page, the last open encounter is kept.
  const [kept, setKept] = useState({ encounterId: urlEncounterId, onThisPage: isOnThisPage });
  // Coming back from another page lands on the list address; return to the encounter left open.
  const isReturningToOpenEncounter =
    isOnThisPage && !kept.onThisPage && urlEncounterId === null && kept.encounterId !== null;

  if (isOnThisPage && !isReturningToOpenEncounter) {
    if (!kept.onThisPage || kept.encounterId !== urlEncounterId) {
      setKept({ encounterId: urlEncounterId, onThisPage: true });
    }
  } else if (!isOnThisPage && kept.onThisPage) {
    setKept({ encounterId: kept.encounterId, onThisPage: false });
  }

  useEffect(() => {
    if (isReturningToOpenEncounter && kept.encounterId !== null) {
      navigate(encounterPath(kept.encounterId), { replace: true });
    }
  }, [isReturningToOpenEncounter, kept.encounterId, navigate]);

  // Until that redirect lands the kept encounter stays on screen, so its session is not dropped.
  const selectedEncounterId = isOnThisPage && !isReturningToOpenEncounter ? urlEncounterId : kept.encounterId;

  return selectedEncounterId === null ? (
    <EncounterListView
      system={system}
      setSystem={setSystem}
      onOpen={(encounterId) => navigate(encounterPath(encounterId))}
      encounterSummaries={encounterSummaries}
      isGm={isGm}
    />
  ) : (
    <LiveEncounter
      key={selectedEncounterId}
      system={system}
      encounterId={selectedEncounterId}
      isGm={isGm}
      onExit={() => navigate(LIST_PATH)}
    />
  );
};
