import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import { encounterPaths, parseEncounterPath } from "src/app/campaignSelection.js";
import { useCurrentEncounter } from "src/api/query/useCampaignQueries.js";
import { useCurrentEncounterWatch } from "src/hooks/useCurrentEncounterWatch.js";
import styles from "./OpenEncounterNotice.module.css";

interface ObservedSelection {
  encounterId: number | null;
  seen: boolean;
}

/**
 * For a player: watches the selected campaign's current encounter and, when the GM starts a new one
 * while the player is in another section, offers to open it. The other section is left as it is;
 * nothing navigates on its own. Following Encounter already shows the new board.
 */
export const OpenEncounterNotice: React.FC = () => {
  const { selected } = useCampaignSelection();
  const campaignId = selected?.id ?? null;
  useCurrentEncounterWatch(campaignId);
  const current = useCurrentEncounter(campaignId);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onEncounter = parseEncounterPath(pathname) !== null;
  // Per campaign, the selection last observed and whether the player has been shown or dismissed it.
  const [observed, setObserved] = useState<Record<number, ObservedSelection>>({});

  const currentId = current.data === undefined ? undefined : current.data?.id ?? null;
  // A different answer, waiting included, starts a new observation, so an encounter that was
  // replaced or reset is new when it returns. The first answer for a campaign and anything seen on
  // the Encounter page count as seen (React's "adjust state on change" pattern).
  if (campaignId !== null && currentId !== undefined) {
    const last = observed[campaignId];
    const unchanged = last?.encounterId === currentId;
    const seen = last === undefined || onEncounter || (unchanged && last.seen);
    if (!unchanged || last.seen !== seen) {
      setObserved({ ...observed, [campaignId]: { encounterId: currentId, seen } });
    }
  }

  if (!selected || onEncounter || currentId === undefined || currentId === null || observed[selected.id]?.seen !== false) {
    return null;
  }

  const markSeen = () => setObserved({ ...observed, [selected.id]: { encounterId: currentId, seen: true } });
  return (
    <div className={styles.notice} role="status" aria-label="New encounter">
      <span>
        {selected.name}: the GM started <strong>{current.data?.name}</strong>.
      </span>
      <button type="button" onClick={() => { markSeen(); navigate(encounterPaths.campaign(selected.id)); }}>
        Open encounter
      </button>
      <button type="button" className={styles.dismiss} onClick={markSeen} aria-label="Dismiss">
        Dismiss
      </button>
    </div>
  );
};
