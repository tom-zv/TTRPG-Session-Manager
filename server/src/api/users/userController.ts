import { userToDto } from "src/utils/format-transformers/users-transformer.js";
import { UnauthorizedError, ValidationError } from "../HttpErrors.js";
import userModel from "./userModel.js";
import { validatePreferencesPatch } from "shared/domain/users/preferences.js";

import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "src/middleware/userAuth.js";


async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.userSession) {
      throw new UnauthorizedError('Unauthorized access');
    }

    res.json(userToDto(authReq.userSession.userDb));
  } catch (err) {
    next(err);
  }
}

export default {
  getMe,
  getPreferences,
  patchPreferences,
}

async function getPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).userSession!.userDb;
    res.json({ preferences: await userModel.getPreferences(user.id) });
  } catch (error) { next(error); }
}

async function patchPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    let patch;
    try { patch = validatePreferencesPatch(req.body); }
    catch (error) { throw new ValidationError((error as Error).message); }
    const user = (req as AuthRequest).userSession!.userDb;
    res.json({ preferences: await userModel.patchPreferences(user.id, patch) });
  } catch (error) { next(error); }
}
