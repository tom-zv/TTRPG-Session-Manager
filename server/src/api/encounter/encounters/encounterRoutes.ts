import express from "express";
import encounterController from "./encounterController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router({ mergeParams: true });

// Base route - /api/:system/encounters
// Every route needs a signed-in user; changes need a GM.
router.use(userAuth());

// POST /encounters - Insert a new encounter
router.post("/", requireGm, encounterController.insertEncounter);

// GET /encounters/summaries - Get summaries of all encounters
router.get("/summaries", encounterController.getAllEncounterSummaries)

// GET /encounters/:id/details - Get encounter details
router.get("/:id/details", encounterController.getEncounterDetails);

// PUT /encounters/:id - Update an encounter
router.put("/:id", requireGm, encounterController.updateEncounter);

// DELETE /encounters/:id - Delete an encounter
router.delete("/:id", requireGm, encounterController.deleteEncounter);

// Encounter state is not served over HTTP: clients receive it when they join the encounter's
// socket room and change it through encounter requests.

export default router;
