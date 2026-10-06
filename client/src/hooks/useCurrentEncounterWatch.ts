import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { CAMPAIGN_KEYS } from "src/api/query/keys.js";
import { watchCampaign } from "src/services/SocketService/namespaces/campaigns.js";

/**
 * Keep this account's answer for the campaign's current encounter fresh: re-read it on each change
 * signal and after each (re)watch. Signals of another campaign never touch this campaign's key.
 */
export function useCurrentEncounterWatch(campaignId: number | null): void {
  const queryClient = useQueryClient();
  const userId = useAuth().currentUser?.id;

  useEffect(() => {
    if (campaignId === null || userId === undefined) return;
    const queryKey = CAMPAIGN_KEYS.currentEncounter(userId, campaignId);
    return watchCampaign(campaignId, () => {
      // A first read has no data yet, so invalidating alone would reuse it, although it may have
      // read the selection before this change. Cancel it so that a new read starts.
      void queryClient
        .cancelQueries({ queryKey, exact: true })
        .then(() => queryClient.invalidateQueries({ queryKey, exact: true }));
      // A new start often follows an End, which adds a past fight.
      void queryClient.invalidateQueries({ queryKey: CAMPAIGN_KEYS.encounterHistory(userId, campaignId), exact: true });
    });
  }, [campaignId, userId, queryClient]);
}
