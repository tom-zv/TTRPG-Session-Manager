import type { SystemType } from "shared/domain/encounters/coreEncounter.js";

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

/**
 * What a campaign's players are shown: the encounter whose combat the GM last started there, until
 * the next start replaces it or a reset or deletion of that encounter clears it. Ending combat keeps
 * it. GM notes are left out.
 */
export interface CurrentEncounterDTO {
  id: number;
  system: SystemType;
  campaignId: number;
  name: string;
  description: string;
  location: string;
  difficulty: string;
  status: "planned" | "active" | "completed";
  createdAt: string;
}

/**
 * `GET /api/campaigns/:id/encounter-history`: the campaign's encounters whose combat has ended (the
 * stored phase decides, not `status`), most recently changed first. Players open them read-only.
 */
export interface EncounterHistoryResponse {
  encounters: CurrentEncounterDTO[];
}

/** `GET /api/campaigns/:id/current-encounter`; `encounter` is null while the players wait. */
export interface CurrentEncounterResponse {
  encounter: CurrentEncounterDTO | null;
}
