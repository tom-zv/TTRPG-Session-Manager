import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import { encounterPaths, parseEncounterPath } from "src/app/campaignSelection.js";
import { CampaignChooser, CampaignUnavailable } from "src/components/CampaignChooser/CampaignChooser.js";

/**
 * A player's Encounter destination for the selected campaign. Until the live board arrives (S3) it
 * only says that the table is waiting for the GM; it reads nothing of the campaign's encounters.
 */
export const PlayerEncounter: React.FC = () => {
  const { pathname } = useLocation();
  const route = parseEncounterPath(pathname);
  const { selected, urlUnavailable } = useCampaignSelection();

  if (route?.campaignId === null && selected) return <Navigate replace to={encounterPaths.campaign(selected.id)} />;
  if (route && urlUnavailable) return <div className="page-container"><CampaignUnavailable /></div>;
  if (!selected) return <div className="page-container"><CampaignChooser isGm={false} /></div>;

  return (
    <section className="page-container" aria-labelledby="player-encounter-heading">
      <h2 id="player-encounter-heading">{selected.name}</h2>
      <p role="status">Waiting for the GM to start an encounter.</p>
    </section>
  );
};
