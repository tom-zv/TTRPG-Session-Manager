import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";

export class EncounterHandlerError extends Error {
  constructor(
    public code: EncounterErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EncounterHandlerError";
  }
}

