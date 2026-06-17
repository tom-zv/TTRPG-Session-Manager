import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import type { AnySystemEncounterState } from "shared/domain/encounters/coreEncounter.js";

export type EncounterEvent = DnD5eEncounterEvent; // Union type for all encounter events
export type encounterEvent = EncounterEvent;

export type EncounterRequest<TEvent = EncounterEvent> = {
  encounterId: number;
  requestId: string;
  baseVersion?: number;
  createdAt?: string;
  requestedEvents: TEvent[];
};

/** Joining returns the current state, so a client never needs a second request to catch up. */
export type EncounterJoinAck<TState = AnySystemEncounterState> =
  | { success: true; encounterState: TState }
  | { success: false; error: string };

export type EncounterOperation<TEvent = EncounterEvent> = {
    encounterId: number;
    operationId: string;
    causedByRequestId?: string;
    version: number;
    appliedEvents: TEvent[];
    createdAt: string;
};
