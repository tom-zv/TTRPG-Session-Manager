import { BaseCommandHandler } from "../commandHandler.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { Versioned, AnySystemEncounterEvent } from "shared/sockets/encounters/types.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { validateDnD5eEvent } from "./eventValidator.js";

export class DnD5eCommandHandler extends BaseCommandHandler<DnD5eEncounterState> {
    
    constructor(
        state: DnD5eEncounterState,
        logEvent: (event: Versioned<DnD5eEncounterEvent>) => void
    ) {
        super(state, logEvent as (event: AnySystemEncounterEvent) => void);
    }

    protected applyEvent(event: AnySystemEncounterEvent): void {
        const dnd5eEvent = validateDnD5eEvent(event);
        
        DnD5eEventProcessor.applyEvent(this.state, dnd5eEvent);
    }

    protected findEntity(entityId: number): unknown {
        const entity = this.state.entityStates.find((e) => e.instanceId === entityId);
        if (!entity) throw new Error(`Entity ${entityId} not found`);
        return entity;
    }
}
