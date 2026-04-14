import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { BaseStateCache } from "../stateCache.js";

export class DnD5eStateCache extends BaseStateCache<DnD5eEncounterState> {
    constructor(initial: DnD5eEncounterState, options: {
        snapshotInterval?: number
    } = {}) {
        super(initial, options);
    }
}