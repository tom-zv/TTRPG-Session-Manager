import express from "express";
import entityController from "./entityController.js";
import { patchEntitySettings } from "./entitySettingsController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router({ mergeParams: true });

// Base route - /api/:system/entities
// Every route needs a signed-in user; changes need a GM.
router.use(userAuth());

// POST /entities/batch - Batch fetch entities by IDs
router.post("/batch", entityController.getEntitiesByIds);

// GET /entities/summary - Get entity summaries for list display
router.get("/summary", entityController.getEntitySummaries);

// GET /entities - Get all entities
router.get("/", entityController.getAllEntities);

// GET /entities/:id - Get entity by ID
router.get("/:id", entityController.getEntityById);

// POST /entities - Insert a new entity
router.post("/", requireGm, entityController.insertEntity);

// PUT /entities/:id - Update an entity
router.put("/:id", requireGm, entityController.updateEntity);
router.patch("/:id/settings", requireGm, patchEntitySettings);

// DELETE /entities/:id - Delete an entity
router.delete("/:id", requireGm, entityController.deleteEntity);

export default router;
