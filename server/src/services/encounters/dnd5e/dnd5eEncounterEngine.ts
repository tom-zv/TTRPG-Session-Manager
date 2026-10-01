import { DnD5eEncounterState} from "shared/domain/encounters/dnd5e/encounter.js"
import { BaseEncounterEngine } from "../encounterEngine.js"
import dnd5eEncounterSnapshotsModel from "src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import { normalizeDnD5eEncounterState } from "shared/domain/encounters/dnd5e/normalizeEncounterState.js";
import { CombatProfileLoader, DnD5eRequestHandler } from "./dnd5eRequestHandler.js";
import { getCombatProfiles, saveCarriedHp } from "src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import type { SqlExecutor } from "src/db.js";

/** A player character's HP as it leaves an encounter. */
export type CarriedHp = { templateId: number; maxHp: number; currentHp: number };

export class DnD5eEncounterEngine extends BaseEncounterEngine<DnD5eEncounterState> {
    constructor(initialState: DnD5eEncounterState, private readonly loadProfiles: CombatProfileLoader = getCombatProfiles) {
        super(
            normalizeDnD5eEncounterState(initialState),
            (state) => new DnD5eRequestHandler(state, loadProfiles)
        );
    }

    protected async persistSnapshot(state: DnD5eEncounterState, transaction?: SqlExecutor): Promise<void> {
        await dnd5eEncounterSnapshotsModel.saveSnapshot(state.id, state, transaction);
    }

    protected entityCopies(state: DnD5eEncounterState): Map<number, number> {
        const copies = new Map<number, number>();
        for (const entity of state.entityStates) {
            copies.set(entity.templateId, (copies.get(entity.templateId) ?? 0) + 1);
        }
        return copies;
    }

    /**
     * When combat ends, player characters keep their current and maximum HP for the next
     * encounter. Conditions, death saves and temporary HP are left behind.
     */
    protected async afterCommit(previous: DnD5eEncounterState, next: DnD5eEncounterState): Promise<void> {
        if (previous.phase === "ended" || next.phase !== "ended") return;
        const templateIds = [...new Set(next.entityStates.map((entity) => entity.templateId))];
        if (!templateIds.length) return;
        const playerCharacters = new Set(
            (await this.loadProfiles(templateIds)).filter((profile) => profile.role === "pc").map((profile) => profile.id)
        );
        const carried: CarriedHp[] = [];
        for (const entity of next.entityStates) {
            // A character normally appears once; if it was added twice, the first copy counts.
            if (!playerCharacters.delete(entity.templateId)) continue;
            carried.push({ templateId: entity.templateId, maxHp: entity.maxHp, currentHp: entity.currentHp });
        }
        if (carried.length) await this.persistCarriedHp(carried);
    }

    protected async persistCarriedHp(carried: CarriedHp[]): Promise<void> {
        for (const { templateId, maxHp, currentHp } of carried) {
            await saveCarriedHp(templateId, maxHp, currentHp);
        }
    }
}
