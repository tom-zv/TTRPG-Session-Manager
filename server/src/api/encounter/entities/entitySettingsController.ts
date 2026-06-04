import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "src/api/HttpErrors.js";
import { validateEntitySettingsPatch } from "shared/domain/encounters/dnd5e/settings.js";
import dnd5eEntityModel from "./dnd5e/dnd5eEntityModel.js";
import { notifyEntityTemplateUpdated } from "src/socket/namespaces/encounters/entityTemplateUpdates.js";

export async function patchEntitySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const entityId = Number(req.params.id);
    if (req.params.system !== "dnd5e" || !Number.isInteger(entityId) || entityId <= 0) {
      throw new ValidationError("Invalid entity or system");
    }
    let patch;
    try { patch = validateEntitySettingsPatch(req.body); }
    catch (error) { throw new ValidationError((error as Error).message); }
    const settings = await dnd5eEntityModel.patchSettings(entityId, patch);
    notifyEntityTemplateUpdated(entityId);
    res.json({ settings });
  } catch (error) { next(error); }
}
