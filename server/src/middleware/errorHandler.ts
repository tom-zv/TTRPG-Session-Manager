import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/HttpErrors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      }
    });
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}