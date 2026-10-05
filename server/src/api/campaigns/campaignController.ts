import { Request, Response, NextFunction } from "express";
import { CAMPAIGN_LIMITS } from "shared/DTO/campaigns/types.js";
import { AuthRequest } from "src/middleware/userAuth.js";
import { campaignMemberToDto, campaignToDto } from "src/utils/format-transformers/campaign-transformer.js";
import { ValidationError } from "../HttpErrors.js";
import campaignService from "./campaignService.js";
import encounterService from "../encounter/encounters/encounterService.js";
import type { CurrentEncounterResponse, EncounterHistoryResponse } from "shared/DTO/campaigns/types.js";
import { CampaignUpdateDB } from "./types.js";

export function parseId(value: unknown, label: string): number {
  const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`Invalid ${label}`);
  return id;
}

function readName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new ValidationError("Campaign name is required");
  if (value.length > CAMPAIGN_LIMITS.name) throw new ValidationError(`Campaign name is limited to ${CAMPAIGN_LIMITS.name} characters`);
  return value;
}

function readDescription(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Description must be text");
  if (value.length > CAMPAIGN_LIMITS.description) {
    throw new ValidationError(`Description is limited to ${CAMPAIGN_LIMITS.description} characters`);
  }
  return value;
}

function readBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (!body || typeof body !== "object") throw new ValidationError("Request body is required");
  return body as Record<string, unknown>;
}

async function listCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).userSession!.userDb;
    const campaigns = await campaignService.listCampaigns(user);
    res.json({ campaigns: campaigns.map(campaignToDto) });
  } catch (error) { next(error); }
}

async function createCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description } = readBody(req);
    const user = (req as AuthRequest).userSession!.userDb;
    const campaign = await campaignService.createCampaign(
      readName(name),
      description === undefined || description === "" ? null : readDescription(description),
      user.id,
    );
    res.status(201).json({ campaign: campaignToDto(campaign) });
  } catch (error) { next(error); }
}

async function updateCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseId(req.params.id, "campaign ID");
    const { name, description } = readBody(req);
    const data: CampaignUpdateDB = {};
    if (name !== undefined) data.name = readName(name);
    if (description !== undefined) data.description = readDescription(description);
    if (Object.keys(data).length === 0) throw new ValidationError("Nothing to update");
    res.json({ campaign: campaignToDto(await campaignService.updateCampaign(id, data)) });
  } catch (error) { next(error); }
}

async function getCurrentEncounter(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).userSession!.userDb;
    const encounter = await encounterService.getCurrentEncounter(user, parseId(req.params.id, "campaign ID"));
    const body: CurrentEncounterResponse = { encounter };
    res.json(body);
  } catch (error) { next(error); }
}

async function getEncounterHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).userSession!.userDb;
    const encounters = await encounterService.getEncounterHistory(user, parseId(req.params.id, "campaign ID"));
    const body: EncounterHistoryResponse = { encounters };
    res.json(body);
  } catch (error) { next(error); }
}

async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await campaignService.listMembers(parseId(req.params.id, "campaign ID"));
    res.json({ members: members.map(campaignMemberToDto) });
  } catch (error) { next(error); }
}

async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await campaignService.addMember(
      parseId(req.params.id, "campaign ID"),
      parseId(req.params.userId, "user ID"),
    );
    res.json({ members: members.map(campaignMemberToDto) });
  } catch (error) { next(error); }
}

async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    await campaignService.removeMember(parseId(req.params.id, "campaign ID"), parseId(req.params.userId, "user ID"));
    res.status(204).end();
  } catch (error) { next(error); }
}

export default {
  listCampaigns,
  createCampaign,
  updateCampaign,
  getCurrentEncounter,
  getEncounterHistory,
  listMembers,
  addMember,
  removeMember,
};
