import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCampaignDTO, UpdateCampaignDTO } from "shared/DTO/campaigns/types.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import {
  addCampaignMember,
  createCampaign,
  listCampaignMembers,
  listCampaigns,
  removeCampaignMember,
  updateCampaign,
} from "../campaignsApi.js";
import { CAMPAIGN_KEYS } from "./keys.js";

/** The campaigns this account can open. Read again on each mount: a GM may change a roster elsewhere. */
export function useCampaigns() {
  const userId = useAuth().currentUser?.id;
  return useQuery({
    queryKey: CAMPAIGN_KEYS.list(userId ?? 0),
    queryFn: ({ signal }) => listCampaigns(signal),
    enabled: userId !== undefined,
    refetchOnMount: "always",
  });
}

export function useCampaignMembers(campaignId: number) {
  const userId = useAuth().currentUser?.id;
  return useQuery({
    queryKey: CAMPAIGN_KEYS.members(userId ?? 0, campaignId),
    queryFn: ({ signal }) => listCampaignMembers(campaignId, signal),
    enabled: userId !== undefined,
    refetchOnMount: "always",
  });
}

/** Every campaign change can alter lists, names and member counts. */
function useInvalidateCampaigns() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CAMPAIGN_KEYS.all });
}

export function useCreateCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ mutationFn: (input: CreateCampaignDTO) => createCampaign(input), onSuccess: invalidate });
}

export function useUpdateCampaign(campaignId: number) {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ mutationFn: (input: UpdateCampaignDTO) => updateCampaign(campaignId, input), onSuccess: invalidate });
}

export function useAddCampaignMember(campaignId: number) {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ mutationFn: (userId: number) => addCampaignMember(campaignId, userId), onSuccess: invalidate });
}

export function useRemoveCampaignMember(campaignId: number) {
  const invalidate = useInvalidateCampaigns();
  return useMutation({ mutationFn: (userId: number) => removeCampaignMember(campaignId, userId), onSuccess: invalidate });
}
