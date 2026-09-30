/**
 * Campaigns: one table of players each. The GM role is installation-wide, so every GM sees and
 * administers every campaign. A player sees only the campaigns they are a member of.
 */

/** A campaign as `GET /api/campaigns` lists it. `memberCount` is sent to GMs only. */
export interface CampaignDTO {
  id: number;
  name: string;
  description: string;
  memberCount?: number;
}

export interface CampaignListResponse {
  campaigns: CampaignDTO[];
}

export interface CampaignResponse {
  campaign: CampaignDTO;
}

/** `POST /api/campaigns` body (GM). */
export interface CreateCampaignDTO {
  name: string;
  description?: string;
}

/** `PATCH /api/campaigns/:id` body (GM); at least one field. */
export interface UpdateCampaignDTO {
  name?: string;
  description?: string;
}

/** One roster row: a registered player admitted to the campaign. */
export interface CampaignMemberDTO {
  userId: number;
  username: string;
  addedAt: string;
}

export interface CampaignMembersResponse {
  members: CampaignMemberDTO[];
}

export const CAMPAIGN_LIMITS = {
  name: 128,
  description: 2000,
} as const;
