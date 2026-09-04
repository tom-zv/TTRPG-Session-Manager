import type { WriteIssue } from "shared/domain/writeValidation.js";

/** A create or update the server rejected with validation issues by field path. */
export class WriteValidationError extends Error {
  constructor(message: string, readonly issues: WriteIssue[]) {
    super(message);
    this.name = "WriteValidationError";
  }
}

const isWriteIssue = (value: unknown): value is WriteIssue =>
  typeof value === "object" && value !== null
  && typeof (value as Record<string, unknown>).path === "string"
  && typeof (value as Record<string, unknown>).message === "string";

/** Reads structured issues when present, with the usual message for other errors. */
export async function writeFailure(response: Response, failure: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => ({}));
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const message = typeof record.message === "string" && record.message ? record.message : failure;
  const details = record.details;
  if (response.status === 400 && Array.isArray(details) && details.length > 0 && details.every(isWriteIssue)) {
    return new WriteValidationError(message, details);
  }
  return new Error(message);
}
