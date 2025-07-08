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
 