import type { CampaignDTO, CampaignMemberDTO } from "shared/DTO/campaigns/types.js";
import type { CampaignDB, CampaignMemberDB } from "src/api/campaigns/types.js";

const toIso = (value: string | Date): string => (value instanceof Date ? value.toISOString() : value);

export function campaignToDto(campaign: CampaignDB): CampaignDTO {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description ?? "",
    ...(campaign.member_count === undefined ? {} : { memberCount: Number(campaign.member_count) }),
  };
}

export function campaignMemberToDto(member: CampaignMemberDB): CampaignMemberDTO {
  return {
    userId: member.user_id,
    username: member.username,
    addedAt: toIso(member.added_at),
  };
}
