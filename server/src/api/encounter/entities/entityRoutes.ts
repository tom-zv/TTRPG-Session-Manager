import express from "express";
import entityController from "./entityController.js";
import { patchEntitySettings } from "./entitySettingsController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router({ mergeParams: true });

// Base route - /api/:system/entities

// POST /entities/batch - Batch fetch entities by IDs
router.post("/batch", entityController.getEntitiesByIds);

// GET /entities/summary - Get entity summaries for list display
router.get("/summary", entityController.getEntitySummaries);

// GET /entities - Get all entities
router.get("/", entityController.getAllEntities);

// GET /entities/:id - Get entity by ID
router.get("/:id", entityController.getEntityById);

// POST /entities - Insert a new entity
router.post("/", userAuth(), requireGm, entityController.insertEntity);

// PUT /entities/:id - Update an entity
router.put("/:id", userAuth(), requireGm, entityController.updateEntity);
router.patch("/:id/settings", userAuth(), requireGm, patchEntitySettings);

// DELETE /entities/:id - Delete an entity
router.delete("/:id", entityController.deleteEntity);

export default router;
