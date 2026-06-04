import express from "express";
import encounterController from "./encounterController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router({ mergeParams: true });

// Base route - /api/:system/encounters
// POST /encounters - Insert a new encounter
router.post("/", userAuth(), requireGm, encounterController.insertEncounter);

// GET /encounters/summaries - Get summaries of all encounters
router.get("/summaries", encounterController.getAllEncounterSummaries)

// GET /encounters/:id/details - Get encounter details
router.get("/:id/details", encounterController.getEncounterDetails);

// PUT /encounters/:id - Update an encounter
router.put("/:id", encounterController.updateEncounter);

// DELETE /encounters/:id - Delete an encounter
router.delete("/:id", encounterController.deleteEncounter);

// State management

// GET /encounters/:id/state - Get encounter state (with entity states)
// Prefers live engine state when active, otherwise returns persisted snapshot
router.get("/:id/state", encounterController.getEncounterState);

// PUT /encounters/:id/state - Save encounter state
// Body: { encounterState: DnD5eEncounterState }
router.put("/:id/state", userAuth(), requireGm, encounterController.saveEncounterState);

export default router;
