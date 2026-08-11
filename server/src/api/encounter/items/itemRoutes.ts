import express from "express";
import itemController from "./itemController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";
import { trimBodyStrings } from "src/middleware/trimBodyStrings.js";

const router = express.Router();

// Base route - /api/dnd5e/items
// Every route needs a signed-in user. Players read only visible items; a hidden item answers like a
// missing one.
router.use(userAuth());

// GET /items - One page of summaries with total and filter choices (query: ItemListParams)
router.get("/", itemController.listItems);

// POST /items/resolve - Resolve a batch of item references (body: ItemResolveRequest)
router.post("/resolve", itemController.resolveItems);

// GET /items/:id - One item with its normalized details
router.get("/:id", itemController.getItemById);

// GET /items/:id/members - A page of a family's specifics, a group's members or a pack's contents
router.get("/:id/members", itemController.getItemMembers);

// POST /items - Create a homebrew item, also used to duplicate one (body: ItemInput)
router.post("/", requireGm, trimBodyStrings, itemController.createItem);

// PUT /items/:id - Replace an item's editable fields; marks imported items as edited
router.put("/:id", requireGm, trimBodyStrings, itemController.updateItem);

// PUT /items/:id/visibility - Hide or show an item to players (body: ItemVisibilityInput)
router.put("/:id/visibility", requireGm, itemController.setItemVisibility);

// DELETE /items/:id - Soft-delete an item. Inventories keep their rows.
router.delete("/:id", requireGm, itemController.deleteItem);

export default router;
