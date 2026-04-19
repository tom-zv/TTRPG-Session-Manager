import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import { DnD5eRequestHandler } from "./dnd5eRequestHandler.js";
import { DnD5eStateCache } from "./dnd5eStateCache.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";
import { DnD5eEventAuthorizer } from "./dnd5eEventAuth.js";

export class DnD5eEncounterEngine extends BaseEncounterEngine<DnD5eEncounterState> {
    constructor(initialState: DnD5eEncounterState) {
        super(
            initialState,
            (state) => new DnD5eStateCache(state),
            (state, eventAuthorizer) => new DnD5eRequestHandler(state, eventAuthorizer),
            (state) => new DnD5eEventAuthorizer(state)
        );
    }

    protected async persistSnapshot(): Promise<void> {
        console.log(`Persisting snapshot for encounter ${this.state.id} at version ${this.state.version}`);
        await dnd5eEncounterService.saveEncounterState(
            this.state.id,
            this.state
        );
    }
}