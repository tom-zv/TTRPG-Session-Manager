import type { CampaignDTO, CampaignMemberDTO, CurrentEncounterDTO } from "shared/DTO/campaigns/types.js";
import type { CampaignDB, CampaignMemberDB } from "src/api/campaigns/types.js";
import type { EncounterDB } from "src/api/encounter/encounters/types.js";

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

/** An encounter as its campaign's players see it: no GM notes. */
export function currentEncounterToDto(encounter: EncounterDB): CurrentEncounterDTO {
  return {
    id: encounter.id,
    system: encounter.system,
    campaignId: encounter.campaign_id,
    name: encounter.name,
    description: encounter.description ?? "",
    location: encounter.location ?? "",
    difficulty: encounter.difficulty ?? "",
    status: encounter.status,
    createdAt: toIso(encounter.created_at),
  };
}
