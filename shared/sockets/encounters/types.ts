import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

export type EncounterEvent = DnD5eEncounterEvent; // Union type for all encounter events
export type encounterEvent = EncounterEvent;

export type EncounterRequest<TEvent = EncounterEvent> = {
  encounterId: number;
  requestId: string;
  baseVersion?: number;
  createdAt?: string;
  requestedEvents: TEvent[];
};

export type EncounterOperation<TEvent = EncounterEvent> = {
    encounterId: number;
    operationId: string;
    causedByRequestId?: string;
    version: number;
    appliedEvents: TEvent[];
    createdAt: string;
};
