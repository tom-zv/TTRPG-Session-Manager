import { Socket } from "socket.io";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";

export type REQUESTValidationResult =
  | { valid: true }
  | { valid: false; error: string; code: EncounterErrorCode };

const invalid = (error: string): REQUESTValidationResult => ({
  valid: false,
  error,
  code: EncounterErrorCode.INVALID_REQUEST,
});

/** Checks the envelope of a payload that arrives untyped from the socket. */
export const validateRequest = (request: unknown): REQUESTValidationResult => {
  if (!request || typeof request !== "object") {
    return invalid("Malformed request");
  }

  const { encounterId, requestId, requestedEvents } = request as Partial<EncounterRequest>;

  if (typeof encounterId !== "number" || !Number.isInteger(encounterId) || encounterId <= 0) {
    return invalid("Missing encounterId");
  }

  if (typeof requestId !== "string" || !requestId) {
    return invalid("Missing requestId");
  }

  if (!Array.isArray(requestedEvents) || requestedEvents.length === 0) {
    return invalid("Missing requestedEvents");
  }

  return { valid: true };
};

export const validateUser = (socket: Socket): REQUESTValidationResult => {
  if (!socket.data.user?.id) {
    return {
      valid: false,
      error: "User not authenticated",
      code: EncounterErrorCode.NOT_AUTHENTICATED,
    };
  }

  return { valid: true };
};
