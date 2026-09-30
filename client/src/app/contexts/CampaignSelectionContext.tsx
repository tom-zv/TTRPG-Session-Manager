import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { CampaignDTO } from "shared/DTO/campaigns/types.js";
import { useCampaigns } from "src/api/query/useCampaignQueries.js";
import {
  encounterPaths,
  parseEncounterPath,
  readLastCampaign,
  resolveCampaignSelection,
  writeLastCampaign,
} from "../campaignSelection.js";

export interface CampaignSelection {
  /** The campaigns this account can open; undefined until loaded. */
  campaigns: CampaignDTO[] | undefined;
  isLoading: boolean;
  error: Error | null;
  /** The resolved campaign, or null while loading and when the account must choose or has none. */
  selected: CampaignDTO | null;
  /** The URL names a campaign this account cannot open. */
  urlUnavailable: boolean;
  /** Record a choice. On the encounter section it also opens that campaign's list. */
  select: (campaignId: number) => void;
}

const CampaignSelectionContext = createContext<CampaignSelection | undefined>(undefined);

/** Mount once per signed-in account (keyed by user ID), inside the router. */
export const CampaignSelectionProvider: React.FC<{ userId: number; children: React.ReactNode }> = ({ userId, children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: campaigns, isLoading, error } = useCampaigns();
  const [storedId, setStoredId] = useState(() => readLastCampaign(userId));

  const route = parseEncounterPath(pathname);
  const urlId = route?.campaignId ?? null;
  const resolution = campaigns
    ? resolveCampaignSelection(campaigns.map((campaign) => campaign.id), urlId, storedId)
    : null;

  // A campaign opened by a valid link becomes the account's last choice (React's "adjust state on
  // change" pattern), and every choice is remembered for this account in this browser.
  const urlChoice = resolution?.source === "url" ? resolution.selectedId : null;
  if (urlChoice !== null && urlChoice !== storedId) setStoredId(urlChoice);
  useEffect(() => {
    if (storedId !== null) writeLastCampaign(userId, storedId);
  }, [storedId, userId]);

  const onEncounterSection = route !== null;
  const select = useCallback((campaignId: number) => {
    setStoredId(campaignId);
    // The URL outranks the stored choice, so the encounter section moves to the new campaign.
    if (onEncounterSection) navigate(encounterPaths.campaign(campaignId));
  }, [onEncounterSection, navigate]);

  const selectedId = resolution?.selectedId ?? null;
  const value = useMemo<CampaignSelection>(() => ({
    campaigns,
    isLoading,
    error,
    selected: campaigns?.find((campaign) => campaign.id === selectedId) ?? null,
    urlUnavailable: resolution?.urlUnavailable ?? false,
    select,
  }), [campaigns, isLoading, error, selectedId, resolution?.urlUnavailable, select]);

  return <CampaignSelectionContext.Provider value={value}>{children}</CampaignSelectionContext.Provider>;
};

export function useCampaignSelection(): CampaignSelection {
  const context = useContext(CampaignSelectionContext);
  if (context === undefined) throw new Error("useCampaignSelection must be used within a CampaignSelectionProvider");
  return context;
}
