import { Request, Response, NextFunction } from "express";
import spellService from "./spellService.js";
import { ValidationError } from "../../HttpErrors.js";
import {
  spellDbToDomain,
  spellDbToSummary,
} from "src/utils/format-transformers/encounter-transformers/dnd5e/spell-transformer.js";

function readSpellId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Spell ID must be a positive integer");
  return id;
}

async function getAllSpells(_req: Request, res: Response, next: NextFunction) {
  try {
    const spells = await spellService.getAllSpells();
    res.status(200).json({ spells: spells.map(({ spell, tags }) => spellDbToSummary(spell, tags)) });
  } catch (err) {
    next(err);
  }
}

async function getSpellById(req: Request, res: Response, next: NextFunction) {
  try {
    const { spell, tags } = await spellService.getSpellById(readSpellId(req));
    res.status(200).json({ spell: spellDbToDomain(spell, tags) });
  } catch (err) {
    next(err);
  }
}

async function getSpellCasters(req: Request, res: Response, next: NextFunction) {
  try {
    const entities = await spellService.getSpellCasters(readSpellId(req));
    res.status(200).json({ entities });
  } catch (err) {
    next(err);
  }
}

export default { getAllSpells, getSpellById, getSpellCasters };
