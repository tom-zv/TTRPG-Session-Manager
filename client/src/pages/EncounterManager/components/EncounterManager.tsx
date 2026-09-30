import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import EncounterListView from "./EncounterListView/EncounterListView.js";
import { useDataSummaries } from "../hooks/useDataSummaries.js";
import {
  supportedSystems,
  SystemType,
} from "shared/domain/encounters/coreEncounter.js";
import type { CampaignDTO } from "shared/DTO/campaigns/types.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useCampaignSelection } from "src/app/contexts/CampaignSelectionContext.js";
import { encounterPaths, parseEncounterPath } from "src/app/campaignSelection.js";
import { CampaignChooser, CampaignUnavailable } from "src/components/CampaignChooser/CampaignChooser.js";
import { useDnD5eEncounterDetails } from "../api/dnd5e/encounters/query/useDnD5eEncounterQueries.js";
import { LiveEncounter } from "./dnd5e/LiveEncounter/LiveEncounterView.js";
import { EncounterApiError } from "../api/encounterApi.js";

type OpenView = { campaignId: number; encounterId: number | null };

/**
 * GM prep for the selected campaign. `/encounter-manager/:campaignId` lists its encounters and
 * `/encounter-manager/:campaignId/:encounterId` opens one. The page stays mounted while other
 * sections are shown, so it remembers what was open; returning through `/encounter-manager` goes
 * back there, unless another campaign was selected meanwhile.
 */
export const EncounterManager: React.FC = () => {
  const { pathname } = useLocation();
  const route = parseEncounterPath(pathname);
  const { selected, urlUnavailable } = useCampaignSelection();
  const [system, setSystem] = useState<SystemType>(supportedSystems[0]);
  const [remembered, setRemembered] = useState<OpenView | null>(null);

  // While this section is shown, a valid URL is what is open (React's "adjust state on change").
  const fromUrl: OpenView | null = route && route.campaignId !== null && !urlUnavailable && selected?.id === route.campaignId
    ? { campaignId: route.campaignId, encounterId: route.encounterId }
    : null;
  if (fromUrl && (remembered?.campaignId !== fromUrl.campaignId || remembered.encounterId !== fromUrl.encounterId)) {
    setRemembered(fromUrl);
  }

  if (route?.campaignId === null) {
    if (!selected) return <div className="page-container"><CampaignChooser isGm /></div>;
    const back = remembered?.campaignId === selected.id ? remembered : { campaignId: selected.id, encounterId: null };
    return <Navigate replace to={back.encounterId === null ? encounterPaths.campaign(back.campaignId) : encounterPaths.encounter(back.campaignId, back.encounterId)} />;
  }
  if (route && urlUnavailable) return <div className="page-container"><CampaignUnavailable /></div>;
  if (!selected) return <div className="page-container"><CampaignChooser isGm /></div>;

  // Hidden behind another section: keep what was open only while its campaign is still selected.
  const view = fromUrl ?? (remembered?.campaignId === selected.id ? remembered : { campaignId: selected.id, encounterId: null });

  return (
    <CampaignPrep
      key={selected.id}
      campaign={selected}
      encounterId={view.encounterId}
      system={system}
      setSystem={setSystem}
    />
  );
};

const CampaignPrep: React.FC<{
  campaign: CampaignDTO;
  encounterId: number | null;
  system: SystemType;
  setSystem: (system: SystemType) => void;
}> = ({ campaign, encounterId, system, setSystem }) => {
  const navigate = useNavigate();
  const isGm = Boolean(useAuth().currentUser?.isGm);
  const { encounterSummaries } = useDataSummaries(system, campaign.id);

  if (encounterId !== null) {
    return (
      <OpenEncounter
        key={encounterId}
        campaign={campaign}
        encounterId={encounterId}
        system={system}
        isGm={isGm}
        onExit={() => navigate(encounterPaths.campaign(campaign.id))}
      />
    );
  }

  return (
    <EncounterListView
      system={system}
      campaign={campaign}
      setSystem={setSystem}
      onOpen={(id) => navigate(encounterPaths.encounter(campaign.id, id))}
      encounterSummaries={encounterSummaries}
      isGm={isGm}
    />
  );
};

/** Joins the encounter only after the server confirms it belongs to this campaign. */
const OpenEncounter: React.FC<{
  campaign: CampaignDTO;
  encounterId: number;
  system: SystemType;
  isGm: boolean;
  onExit: () => void;
}> = ({ campaign, encounterId, system, isGm, onExit }) => {
  const details = useDnD5eEncounterDetails(campaign.id, encounterId);

  if (details.isError) {
    const notInCampaign = details.error instanceof EncounterApiError && details.error.status === 404;
    return (
      <div className="page-container" role="alert">
        {notInCampaign ? (
          <p>This encounter is not part of {campaign.name}.</p>
        ) : (
          <>
            <p>Could not open this encounter.</p>
            <p>{details.error instanceof Error ? details.error.message : "The encounter could not be loaded."}</p>
            <button type="button" onClick={() => void details.refetch()} disabled={details.isFetching}>Try again</button>
          </>
        )}
        <Link to={encounterPaths.campaign(campaign.id)}>Back to {campaign.name}</Link>
      </div>
    );
  }
  if (!details.data) return <div className="page-container">Opening encounter…</div>;

  return (
    <LiveEncounter
      system={system}
      campaignId={campaign.id}
      encounterId={encounterId}
      isGm={isGm}
      onExit={onExit}
    />
  );
};
