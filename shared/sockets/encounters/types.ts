import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";


export type encounterEvent = DnD5eEncounterEvent; // Union type for all encounter events

// AppliedEventRecord represents an event that has been applied to the encounter state, along with any inverse events needed for undo functionality
export type AppliedEventRecord = {
    event: encounterEvent;
    inverseEvents: encounterEvent[];
};

export type EncounterOperation = {
    encounterId: number;
    operationId: string;
    kind: "apply" | "undo";
    causedByRequestId?: string;
    version: number;
    appliedEvents: AppliedEventRecord[];
    createdAt: string;
};

export type EncounterOperationDTO = {
    encounterId: number;
    operationId: string;
    kind: "apply" | "undo";
    causedByRequestId?: string;
    version: number;
    appliedEvents: encounterEvent[];
    createdAt: string;
};

export const toEncounterOperationDTO = (
    operation: EncounterOperation,
): EncounterOperationDTO => ({
    encounterId: operation.encounterId,
    operationId: operation.operationId,
    kind: operation.kind,
    causedByRequestId: operation.causedByRequestId,
    version: operation.version,
    createdAt: operation.createdAt,
    appliedEvents: operation.appliedEvents.map(({ event }) => structuredClone(event)),
});

