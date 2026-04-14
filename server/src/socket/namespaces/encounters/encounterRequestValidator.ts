import { Socket } from "socket.io";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";

export type REQUESTValidationResult =
  | { valid: true }
  | { valid: false; error: string; code: EncounterErrorCode };

export const validateRequest = (request: EncounterRequest): REQUESTValidationResult => {
  if (!request.encounterId || typeof request.encounterId !== "number") {
    return {
      valid: false,
      error: "Missing encounterId",
      code: EncounterErrorCode.INVALID_REQUEST,
    };
  }

  if (!request.requestId) {
    return {
      valid: false,
      error: "Missing requestId",
      code: EncounterErrorCode.INVALID_REQUEST,
    };
  }

  if (request.requestedEvents.length === 0) {
    return {
      valid: false,
      error: "Missing requestedEvents",
      code: EncounterErrorCode.INVALID_REQUEST,
    };
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
