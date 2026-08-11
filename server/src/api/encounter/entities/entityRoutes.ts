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

// GET /entities/mine - The signed-in user's assigned player characters (Compendium "My characters").
// GET /entities/mine/:id - One of them; a missing, unassigned or non-PC ID is the same 404.
// Both sit before /:id so "mine" is not read as an ID.
router.get("/mine", entityController.getMyEntitySummaries);
router.get("/mine/:id", entityController.getMyEntityById);

// GET /entities - Get all entities
router.get("/", entityController.getAllEntities);

// GET /entities/:id - Get entity by ID
router.get("/:id", entityController.getEntityById);

// POST /entities - Insert a new entity
router.post("/", requireGm, entityController.insertEntity);

// PUT /entities/:id - Update an entity
router.put("/:id", requireGm, entityController.updateEntity);
router.patch("/:id/settings", requireGm, patchEntitySettings);

// GET /entities/:id/inventory - { items, revision }; GMs for PCs and featured NPCs, players for their
//   assigned PCs. Linked rows carry what the viewer may know of their catalog item.
// PUT /entities/:id/inventory - Replace the whole list (GM).
//   Body: { items: [{ name, quantity, notes?, itemId? }], expectedRevision? }; stale revision 409.
// POST /entities/:id/inventory/items - Append one catalog item to the latest list (GM).
//   Body: { itemId, quantity, notes? }; 201 with { items, revision }.
// Unavailable reads and ineligible writes are 404. Names and notes are trimmed by the shared validators.
router.get("/:id/inventory", entityController.getEntityInventory);
router.put("/:id/inventory", requireGm, entityController.replaceEntityInventory);
router.post("/:id/inventory/items", requireGm, entityController.appendEntityInventoryItem);

// PUT /entities/:id/controllers - Assign the users who may run this entity
// Body: { userIds: number[] }
router.put("/:id/controllers", requireGm, entityController.setEntityControllers);

// DELETE /entities/:id - Delete an entity
router.delete("/:id", requireGm, entityController.deleteEntity);

export default router;
