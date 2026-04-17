import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

type EmitEvent = (event: DnD5eEncounterEvent) => void;

export class DnD5eStatActions {
    constructor(
        private emitEvent: EmitEvent,
    ) {}

    setInitiative(entityId: number, initiative: number): void {
        this.emitEvent({
            type: "setInitiative",
            values: { targetId: entityId, initiative },
        });
    }
    
}