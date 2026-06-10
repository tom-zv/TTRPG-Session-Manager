import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";
import { DnD5eEventAuthorizer } from "./dnd5eEventAuth.js";
import { normalizeDnD5eEncounterState } from "shared/domain/encounters/dnd5e/normalizeEncounterState.js";
import { CombatProfileLoader, DnD5eRequestHandler } from "./dnd5eRequestHandler.js";

export class DnD5eEncounterEngine extends BaseEncounterEngine<DnD5eEncounterState> {
    constructor(initialState: DnD5eEncounterState, loadProfiles?: CombatProfileLoader) {
        super(
            normalizeDnD5eEncounterState(initialState),
            (state, eventAuthorizer) => new DnD5eRequestHandler(state, eventAuthorizer, loadProfiles),
            (state) => new DnD5eEventAuthorizer(state)
        );
    }

    protected async persistSnapshot(state: DnD5eEncounterState): Promise<void> {
        await dnd5eEncounterService.saveEncounterState(state.id, state);
    }
}
