export enum EncounterErrorCode {
  NO_ACTIVE_ENCOUNTER = "NO_ACTIVE_ENCOUNTER",
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
