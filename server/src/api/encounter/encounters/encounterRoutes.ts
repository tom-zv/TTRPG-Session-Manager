import express from "express";
import encounterController from "./encounterController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router({ mergeParams: true });

// Base route - /api/:system/encounters
// Every route needs a signed-in user; changes need a GM. Every encounter belongs to one campaign.
// Reads name the campaign and need access to it (any GM, or a member); an encounter of another
// campaign answers 404 like a missing one.
router.use(userAuth());

// POST /encounters - Insert a new encounter (body: { campaignId, data })
router.post("/", requireGm, encounterController.insertEncounter);

// GET /encounters/summaries?campaignId= - Summaries of one campaign's encounters
router.get("/summaries", encounterController.getAllEncounterSummaries)

// GET /encounters/:id/details?campaignId= - One encounter of that campaign
router.get("/:id/details", encounterController.getEncounterDetails);

// PUT /encounters/:id - Update an encounter
router.put("/:id", requireGm, encounterController.updateEncounter);

// DELETE /encounters/:id - Delete an encounter
router.delete("/:id", requireGm, encounterController.deleteEncounter);

// Encounter state is not served over HTTP: clients receive it when they join the encounter's
// socket room and change it through encounter requests.

export default router;
