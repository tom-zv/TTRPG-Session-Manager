import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import { DnD5eCommandHandler } from "./dnd5eCommandHandler.js";
import { DnD5eStateCache } from "./dnd5eStateCache.js";
import { Versioned } from "shared/sockets/encounters/types.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";

export class DnD5eEncounterEngine extends BaseEncounterEngine<
  DnD5eEncounterState,
  Versioned<DnD5eEncounterEvent>
> {
    constructor(initialState: DnD5eEncounterState) {
        super(
            initialState,
            (state) => new DnD5eStateCache(state),
            (state, logEvent) => new DnD5eCommandHandler(state, logEvent)
        );
    }

    protected async persistActiveSnapshot(): Promise<void> {
        // Save the current active snapshot to the database
        await dnd5eEncounterService.saveEncounterState(
            this.state.id,
            this.state,
            'active'
        );
    }
}