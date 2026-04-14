import { encounterEvent } from "./types.js";

/**
 * Base request structure for encounter operations
 */
export type EncounterRequest =
  {
    encounterId: number;
    requestId: string;
    baseVersion?: number;
    createdAt?: string;
    requestedEvents: encounterEvent[];
  };
