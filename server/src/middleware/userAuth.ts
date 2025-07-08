import { Request, Response, NextFunction } from "express";
import authModel from "src/api/auth/authModel.js";
import { UserSessionDB } from "src/api/auth/types.js";
import { UnauthorizedError } from "src/api/HttpErrors.js";

export interface AuthRequest extends Request {
  userSession?: UserSessionDB
}

/**
 * Middleware to authenticate users using DB-stored tokens.
 * @param options Optional: require authentication or just check it.
 */
export function userAuth(options: { optional?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;

    const authHeader = req.header("Authorization") || "";
    const tokenFromHeader = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;

    const token = tokenFromHeader || req.cookies?.sessionToken;

    if (!token) {
      if (options.optional) return next();
      throw new UnauthorizedError("Authentication required");
    }

    const sessionDb = await authModel.getSessionByToken(token);

    if(!sessionDb) {
      if (options.optional) return next();
      throw new UnauthorizedError("Authentication failed");
    }

    if (new Date(sessionDb.expires_at) < new Date()) {
        await authModel.deleteSession(token);
        if (options.optional) return next();
        throw new UnauthorizedError("Authentication failed");
    }

    const userDb = await authModel.getUserByToken(token);

    if(!userDb) {
      throw new UnauthorizedError("Authentication failed");
    }

    authReq.userSession = {userDb, sessionDb};

    return next();
  };
};
