import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { CampaignDTO } from "shared/DTO/campaigns/types.js";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import { encounterPaths, parseEncounterPath } from "src/app/campaignSelection.js";
import { CampaignChooser, CampaignUnavailable } from "src/components/CampaignChooser/CampaignChooser.js";
import { useCurrentEncounter } from "src/api/query/useCampaignQueries.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";

/**
 * A player's Encounter destination for the selected campaign: the board of the campaign's current
 * encounter, or a waiting message when the GM has not started one. Which board is shown follows the
 * stored selection only; combat updates arrive on that board's own socket session.
 */
export const PlayerEncounter: React.FC = () => {
  const { pathname } = useLocation();
  const route = parseEncounterPath(pathname);
  const { selected, urlUnavailable } = useCampaignSelection();

  if (route?.campaignId === null && selected) return <Navigate replace to={encounterPaths.campaign(selected.id)} />;
  if (route && urlUnavailable) return <div className="page-container"><CampaignUnavailable /></div>;
  if (!selected) return <div className="page-container"><CampaignChooser isGm={false} /></div>;

  // Keyed by campaign: nothing of another campaign's answer or board survives a switch.
  return <CampaignBoard key={selected.id} campaign={selected} />;
};

const CampaignBoard: React.FC<{ campaign: CampaignDTO }> = ({ campaign }) => {
  const current = useCurrentEncounter(campaign.id);

  if (current.isError && current.data === undefined) {
    return (
      <section className="page-container" role="alert">
        <p>Could not load {campaign.name}&apos;s encounter: {current.error.message}</p>
        <button type="button" onClick={() => void current.refetch()} disabled={current.isFetching}>Try again</button>
      </section>
    );
  }
  if (current.data === undefined) return <div className="page-container">Loading {campaign.name}…</div>;
  if (current.data === null) {
    return (
      <section className="page-container" aria-labelledby="player-encounter-heading">
        <h2 id="player-encounter-heading">{campaign.name}</h2>
        <p role="status">Waiting for the GM to start an encounter.</p>
      </section>
    );
  }

  const encounter = current.data;
  // Keyed by encounter: a new start replaces the session, so packets of the old board are dropped.
  return (
    <LiveEncounter
      key={encounter.id}
      system={encounter.system}
      campaignId={campaign.id}
      encounterId={encounter.id}
      isGm={false}
      playerBoard={{ details: encounter }}
    />
  );
};
