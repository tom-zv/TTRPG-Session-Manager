import type {
  CampaignDTO,
  CampaignMemberDTO,
  CreateCampaignDTO,
  CurrentEncounterDTO,
  CurrentEncounterResponse,
  UpdateCampaignDTO,
} from "shared/DTO/campaigns/types.js";
import { authenticatedJsonHeaders } from "./requestHeaders.js";

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(`/api/campaigns${path}`, {
    ...init,
    headers: authenticatedJsonHeaders(),
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" && body.message ? body.message : fallback);
  return body as T;
}

/** Every campaign for a GM; the player's memberships otherwise. */
export async function listCampaigns(signal?: AbortSignal): Promise<CampaignDTO[]> {
  return (await request<{ campaigns: CampaignDTO[] }>("", { signal }, "Failed to load campaigns")).campaigns;
}

export async function createCampaign(input: CreateCampaignDTO): Promise<CampaignDTO> {
  return (await request<{ campaign: CampaignDTO }>("", { method: "POST", body: JSON.stringify(input) }, "Failed to create campaign")).campaign;
}

export async function updateCampaign(id: number, input: UpdateCampaignDTO): Promise<CampaignDTO> {
  return (await request<{ campaign: CampaignDTO }>(`/${id}`, { method: "PATCH", body: JSON.stringify(input) }, "Failed to update campaign")).campaign;
}

export async function listCampaignMembers(id: number, signal?: AbortSignal): Promise<CampaignMemberDTO[]> {
  return (await request<{ members: CampaignMemberDTO[] }>(`/${id}/members`, { signal }, "Failed to load players")).members;
}

export async function addCampaignMember(id: number, userId: number): Promise<CampaignMemberDTO[]> {
  return (await request<{ members: CampaignMemberDTO[] }>(`/${id}/members/${userId}`, { method: "PUT" }, "Failed to add player")).members;
}

export async function removeCampaignMember(id: number, userId: number): Promise<void> {
  await request<void>(`/${id}/members/${userId}`, { method: "DELETE" }, "Failed to remove player");
}

/** The campaign's current encounter, or null while its players wait. */
export async function getCurrentEncounter(id: number, signal?: AbortSignal): Promise<CurrentEncounterDTO | null> {
  return (await request<CurrentEncounterResponse>(`/${id}/current-encounter`, { signal }, "Failed to load the current encounter")).encounter;
}
