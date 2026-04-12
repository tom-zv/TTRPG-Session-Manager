import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { Versioned } from "shared/sockets/encounters/types.js";
import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { BaseStateCache } from "../stateCache.js";

export class DnD5eStateCache extends BaseStateCache<DnD5eEncounterState, Versioned<DnD5eEncounterEvent>> {
    constructor(initial: DnD5eEncounterState, options: {
        snapshotInterval?: number
    } = {}) {
        super(initial, options);
    }
}