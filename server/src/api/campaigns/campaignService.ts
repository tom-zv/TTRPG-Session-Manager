import campaignModel from "./campaignModel.js";
import userModel from "../users/userModel.js";
import type { UserDB } from "../users/types.js";
import { CampaignDB, CampaignMemberDB, CampaignUpdateDB } from "./types.js";
import { NotFoundError, ValidationError } from "../HttpErrors.js";

export const CAMPAIGN_NOT_FOUND = "Campaign not found";

async function requireCampaign(id: number): Promise<CampaignDB> {
  const campaign = await campaignModel.getCampaignById(id);
  if (!campaign) throw new NotFoundError(CAMPAIGN_NOT_FOUND);
  return campaign;
}

/**
 * The campaign access check of every campaign-scoped read and write: a GM reaches any existing
 * campaign, a player only one they are a member of. Membership is read on each request, so a
 * roster change applies to the next one. A campaign the user cannot reach answers like a missing one.
 */
async function assertCampaignAccess(user: Pick<UserDB, "id" | "is_gm">, campaignId: number): Promise<void> {
  const allowed = user.is_gm
    ? (await campaignModel.getCampaignById(campaignId)) !== null
    : await campaignModel.isMember(campaignId, user.id);
  if (!allowed) throw new NotFoundError(CAMPAIGN_NOT_FOUND);
}

/** GMs: every campaign. Players: their memberships. */
async function listCampaigns(user: Pick<UserDB, "id" | "is_gm">): Promise<CampaignDB[]> {
  return user.is_gm ? campaignModel.getAllCampaigns() : campaignModel.getCampaignsForMember(user.id);
}

async function createCampaign(name: string, description: string | null, createdBy: number): Promise<CampaignDB> {
  const id = await campaignModel.insertCampaign(name, description, createdBy);
  return requireCampaign(id);
}

async function updateCampaign(id: number, data: CampaignUpdateDB): Promise<CampaignDB> {
  if (!(await campaignModel.updateCampaign(id, data))) throw new NotFoundError(CAMPAIGN_NOT_FOUND);
  return requireCampaign(id);
}

async function listMembers(campaignId: number): Promise<CampaignMemberDB[]> {
  await requireCampaign(campaignId);
  return campaignModel.getMembers(campaignId);
}

/** Admit a registered player. GM accounts already reach every campaign and are not members. */
async function addMember(campaignId: number, userId: number): Promise<CampaignMemberDB[]> {
  await requireCampaign(campaignId);
  const user = await userModel.getUserById(userId);
  if (!user) throw new NotFoundError("User not found");
  if (user.is_gm) throw new ValidationError("GMs have access to every campaign; only players are added");
  await campaignModel.addMember(campaignId, userId);
  return campaignModel.getMembers(campaignId);
}

async function removeMember(campaignId: number, userId: number): Promise<void> {
  await requireCampaign(campaignId);
  if (!(await campaignModel.removeMember(campaignId, userId))) throw new NotFoundError("Member not found");
}

export default {
  assertCampaignAccess,
  listCampaigns,
  createCampaign,
  updateCampaign,
  listMembers,
  addMember,
  removeMember,
};
