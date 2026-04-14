import { encounterEvent } from "./types.js";

/**
 * Base request structure for encounter operations
 */
export type EncounterRequest =
  | {
      encounterId: number;
      requestId: string;
      kind: "apply";
      baseVersion?: number;
      createdAt?: string;
      requestedEvents: encounterEvent[];
    }
  | {
      encounterId: number;
      requestId: string;
      kind: "undo";
      targetOperationId: string;
      baseVersion?: number;
      createdAt?: string;
    };
