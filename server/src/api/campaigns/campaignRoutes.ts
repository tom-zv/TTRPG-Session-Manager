import express from "express";
import campaignController from "./campaignController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";
import { trimBodyStrings } from "src/middleware/trimBodyStrings.js";

// Base route - /api/campaigns
// Every GM administers every campaign. A player lists only the campaigns they are a member of.
const router = express.Router();
router.use(userAuth());

// GET /campaigns - { campaigns: CampaignDTO[] }: every campaign for a GM, memberships for a player
router.get("/", campaignController.listCampaigns);

// POST /campaigns - Create (body: CreateCampaignDTO); 201 { campaign }
router.post("/", requireGm, trimBodyStrings, campaignController.createCampaign);

// PATCH /campaigns/:id - Edit (body: UpdateCampaignDTO); { campaign }
router.patch("/:id", requireGm, trimBodyStrings, campaignController.updateCampaign);

// GET /campaigns/:id/current-encounter - What the campaign's players are shown; { encounter | null }.
// Any user who can reach the campaign (a GM, or a member).
router.get("/:id/current-encounter", campaignController.getCurrentEncounter);

// GET /campaigns/:id/members - The roster; { members }
router.get("/:id/members", requireGm, campaignController.listMembers);

// PUT /campaigns/:id/members/:userId - Admit a registered player; { members }. Idempotent.
router.put("/:id/members/:userId", requireGm, campaignController.addMember);

// DELETE /campaigns/:id/members/:userId - Remove a member; 204
router.delete("/:id/members/:userId", requireGm, campaignController.removeMember);

export default router;
