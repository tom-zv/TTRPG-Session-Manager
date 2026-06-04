import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import { DnD5eStateCache } from "./dnd5eStateCache.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";
import { DnD5eEventAuthorizer } from "./dnd5eEventAuth.js";
import { normalizeDnD5eEncounterState } from "shared/domain/encounters/dnd5e/normalizeEncounterState.js";
import type { EncounterOperation } from "shared/sockets/encounters/types.js";
import { CombatProfileLoader, DnD5eRequestHandler } from "./dnd5eRequestHandler.js";

export class DnD5eEncounterEngine extends BaseEncounterEngine<DnD5eEncounterState> {
    constructor(initialState: DnD5eEncounterState, loadProfiles?: CombatProfileLoader) {
        super(
            normalizeDnD5eEncounterState(initialState),
            (state) => new DnD5eStateCache(state),
            (state, eventAuthorizer) => new DnD5eRequestHandler(state, eventAuthorizer, loadProfiles),
            (state) => new DnD5eEventAuthorizer(state)
        );
    }

    protected shouldPersistOperation(previous: DnD5eEncounterState, next: DnD5eEncounterState, operation: EncounterOperation): boolean {
        return operation.appliedEvents.some((event) => ["moveToGrave", "restoreFromGrave", "setDeathSaves", "updateEncounterSettings", "resetEncounter"].includes(event.type)) ||
            previous.entityStates.some((entity) => {
                const updated = next.entityStates.find((candidate) => candidate.instanceId === entity.instanceId);
                return !updated ? entity.inGrave :
                    entity.deathSaveSuccesses !== updated.deathSaveSuccesses || entity.deathSaveFailures !== updated.deathSaveFailures;
            });
    }

    protected async persistSnapshot(state: DnD5eEncounterState): Promise<void> {
        await dnd5eEncounterService.saveEncounterState(state.id, state);
    }
}
