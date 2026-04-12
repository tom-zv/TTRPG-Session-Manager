import { Socket } from "socket.io";
import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";

export type CommandValidationResult =
  | { valid: true }
  | { valid: false; error: string; code: EncounterErrorCode };

export const validateCommand = (command: EncounterCommand): CommandValidationResult => {
  if (!command.encounterId || typeof command.encounterId !== "number") {
    return {
      valid: false,
      error: "Missing encounterId",
      code: EncounterErrorCode.INVALID_COMMAND,
    };
  }

  if (!command.commandId) {
    return {
      valid: false,
      error: "Missing commandId",
      code: EncounterErrorCode.INVALID_COMMAND,
    };
  }

  if (!command.event) {
    return {
      valid: false,
      error: "Missing event",
      code: EncounterErrorCode.INVALID_COMMAND,
    };
  }

  if (!command.timestamp) {
    return {
      valid: false,
      error: "Missing timestamp",
      code: EncounterErrorCode.INVALID_COMMAND,
    };
  }

  return { valid: true };
};

export const validateUser = (socket: Socket): CommandValidationResult => {
  if (!socket.data.user?.id) {
    return {
      valid: false,
      error: "User not authenticated",
      code: EncounterErrorCode.NOT_AUTHENTICATED,
    };
  }

  return { valid: true };
};
