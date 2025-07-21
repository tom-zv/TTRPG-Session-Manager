import express from "express";
import encounterController from "./encounterController.js";

const router = express.Router();

// Base route - /api/:system/encounters

// GET /encounters - Get all encounters
router.get("/", encounterController.getAllEncounters);

// POST /encounters - Insert a new encounter
router.post("/", encounterController.insertEncounter);

// POST /encounters/assign-entities - Assign entities to an encounter
router.post("/assign-entities", encounterController.assignEntitiesToEncounter);

// PUT /encounters/:id - Update an encounter
router.put("/:id", encounterController.updateEncounter);

// DELETE /encounters/:id - Delete an encounter
router.delete("/:id", encounterController.deleteEncounter);

export default router;