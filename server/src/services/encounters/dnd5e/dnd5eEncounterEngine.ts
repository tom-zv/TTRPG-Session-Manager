import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import { DnD5eRequestHandler } from "./dnd5eRequestHandler.js";
import { DnD5eStateCache } from "./dnd5eStateCache.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";

export class DnD5eEncounterEngine extends BaseEncounterEngine<DnD5eEncounterState> {
    constructor(initialState: DnD5eEncounterState) {
        super(
            initialState,
            (state) => new DnD5eStateCache(state),
            (state) => new DnD5eRequestHandler(state)
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