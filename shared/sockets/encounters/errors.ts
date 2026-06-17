export enum EncounterErrorCode {
  ENCOUNTER_NOT_FOUND = "ENCOUNTER_NOT_FOUND",
  NOT_AUTHENTICATED = "NOT_AUTHENTICATED",
  NOT_AUTHORIZED = "NOT_AUTHORIZED",
  INVALID_REQUEST = "INVALID_REQUEST",
  REQUEST_FAILED = "REQUEST_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
}

export type EncounterError = {
  code: EncounterErrorCode;
  message: string;
  timestamp: number;
  requestId?: string;
};
