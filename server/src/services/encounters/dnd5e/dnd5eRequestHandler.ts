import { BaseRequestHandler } from "../requestHandler.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { validateDnD5eEvent } from "./dnd5eEventValidator.js";
import { IEventAuthorizer } from "../requestHandler.js";

export class DnD5eRequestHandler extends BaseRequestHandler<DnD5eEncounterState> {
    constructor(state: DnD5eEncounterState, eventAuthorizer: IEventAuthorizer) {
        super(state, eventAuthorizer);
    }

    protected validateEvent(event: DnD5eEncounterEvent): DnD5eEncounterEvent {
        return validateDnD5eEvent(event);
    }

    protected applyEvent(event: DnD5eEncounterEvent): void {
        DnD5eEventProcessor.applyEvent(this.state, event);
    }

    protected findEntity(entityId: number): unknown {
        const entity = this.state.entityStates.find((e) => e.instanceId === entityId);
        if (!entity) throw new Error(`Entity ${entityId} not found`);
        return entity;
    }
}
