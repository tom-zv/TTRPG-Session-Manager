import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../api/HttpErrors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  // If headers already sent, pass to next error handler
  if (res.headersSent) {
    return next(err);
  }

  try {
    if (err instanceof HttpError) {
      // Use your custom error handling for HttpError instances
      if (typeof res.status === 'function') {
        return res.status(err.statusCode).json({
          error: {
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          }
        });
      } else {
        // Fallback if status method not available
        res.writeHead(err.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          }
        }));
        return;
      }
    }

    // Generic error handling
    console.error(err);
    
    if (typeof res.status === 'function') {
      res.status(500).json({ error: { message: 'Internal server error' } });
    } else {
      // Fallback if status method not available
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Internal server error' } }));
    }
  } catch (handlerError) {
    // Error in the error handler itself
    console.error('Error in error handler:', handlerError);
    next(err); // Pass to Express default handler
  }
}