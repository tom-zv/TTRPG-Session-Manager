import { Request, Response, NextFunction } from "express";

export function trimBodyStrings(req: Request, _res: Response, next: NextFunction) {
    
    if (req.body && typeof req.body === "object") {
        for (const key in req.body) {
            if (typeof req.body[key] === "string") {
                req.body[key] = req.body[key].trim();
            }
        }
    }
    next();
}