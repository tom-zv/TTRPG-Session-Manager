import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

export type encounterEvent = DnD5eEncounterEvent; // Union type for all encounter events

export type EncounterRequest = {
  encounterId: number;
  requestId: string;
  baseVersion?: number;
  createdAt?: string;
  requestedEvents: encounterEvent[];
};

export type EncounterOperation = {
    encounterId: number;
    operationId: string;
    causedByRequestId?: string;
    version: number;
    appliedEvents: encounterEvent[];
    createdAt: string;
};
