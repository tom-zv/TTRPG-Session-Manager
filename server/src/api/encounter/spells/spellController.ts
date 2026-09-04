import { Request, Response, NextFunction } from "express";
import spellService from "./spellService.js";
import { ValidationError } from "../../HttpErrors.js";
import { validateSpellInput, type SpellInput } from "shared/domain/dnd5e/spell.js";
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

function readSpellInput(req: Request): SpellInput {
  const validated = validateSpellInput(req.body);
  if (!validated.ok) throw new ValidationError("Invalid spell data.", validated.issues);
  return validated.value;
}

async function createSpell(req: Request, res: Response, next: NextFunction) {
  try {
    const { spell, tags } = await spellService.createSpell(readSpellInput(req));
    res.status(201).json({ spell: spellDbToDomain(spell, tags) });
  } catch (err) {
    next(err);
  }
}

async function updateSpell(req: Request, res: Response, next: NextFunction) {
  try {
    const id = readSpellId(req);
    const { spell, tags } = await spellService.updateSpell(id, readSpellInput(req));
    res.status(200).json({ spell: spellDbToDomain(spell, tags) });
  } catch (err) {
    next(err);
  }
}

async function deleteSpell(req: Request, res: Response, next: NextFunction) {
  try {
    await spellService.deleteSpell(readSpellId(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export default { getAllSpells, getSpellById, getSpellCasters, createSpell, updateSpell, deleteSpell };
