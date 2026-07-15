import express from "express";
import spellController from "./spellController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

const router = express.Router();

// Base route - /api/dnd5e/spells
// Every route needs a signed-in user: players read spells too.
router.use(userAuth());

// GET /spells - Whole index (summaries); filtering happens on the client
router.get("/", spellController.getAllSpells);

// GET /spells/:id - One spell with its full text
router.get("/:id", spellController.getSpellById);

// GET /spells/:id/casters - Entities that list the spell (reveals monsters, so GM only)
router.get("/:id/casters", requireGm, spellController.getSpellCasters);

export default router;
