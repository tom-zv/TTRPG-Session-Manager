import { userToDto } from "src/utils/format-transformers/users-transformer.js";
import { UnauthorizedError } from "../HttpErrors.js";

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
}