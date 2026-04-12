export enum EncounterErrorCode {
  NO_ACTIVE_ENCOUNTER = "NO_ACTIVE_ENCOUNTER",
  NOT_AUTHENTICATED = "NOT_AUTHENTICATED",
  NOT_AUTHORIZED = "NOT_AUTHORIZED",
  INVALID_COMMAND = "INVALID_COMMAND",
  COMMAND_FAILED = "COMMAND_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
}

export type EncounterError = {
  code: EncounterErrorCode;
  message: string;
  timestamp: number;
  commandId?: string;
};
