export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown; // Used for custom error info e.g
                              // form fields that contain an error

  constructor(statusCode: number, message?: string, details?: string) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends HttpError{
    constructor(message?: string){
        super(400, message)
    }
}

export class NotFoundError extends HttpError {
  constructor(message?: string) {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message?: string) {
    super(401, message);
    this.name = "UnauthorizedError";
  }

  get headers() {
    return { 'WWW-Authenticate': 'Bearer' };
  }
}

/** A 409 whose body carries the current state alongside the message, e.g. a stale write's latest version. */
export class ConflictError extends HttpError {
  readonly body: Record<string, unknown>;

  constructor(message: string, body: Record<string, unknown> = {}) {
    super(409, message);
    this.name = "ConflictError";
    this.body = body;
  }
}
