import {
    AnySystemEncounterState,
    BaseEncounterState,
    CoreEncounter,
    STATUS_BY_PHASE,
} from "shared/domain/encounters/coreEncounter.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { IRequestHandler } from "./requestHandler.js";
import encounterModel from "src/api/encounter/encounters/encounterModel.js";
import currentEncounterModel from "src/api/campaigns/currentEncounterModel.js";
import { UserDB } from "src/api/users/types.js";
import { corePool, type SqlExecutor, withTransaction } from "src/db.js";

/**
 * A committed operation and the campaign whose current encounter it changed: a start selects the
 * encounter, a reset of the current encounter clears it. Null for every other operation, for a
 * reset of an encounter that is no longer current, and for a repeated request ID.
 */
export type EncounterCommit = {
    operation: EncounterOperation;
    currentEncounterChangedIn: number | null;
};

/** How an operation changes its campaign's current encounter. */
type SelectionChange = "select" | "clearIfCurrent" | null;

const selectionChange = (previous: BaseEncounterState["phase"], next: BaseEncounterState["phase"]): SelectionChange => {
    if (previous === "setup" && next === "running") return "select";
    if (previous !== "setup" && next === "setup") return "clearIfCurrent";
    return null;
};

export interface IEncounterEngine<TState extends AnySystemEncounterState = AnySystemEncounterState> {
    /** `commit`, returning only the operation. */
    dispatch(request: EncounterRequest, user: UserDB): Promise<EncounterOperation>;
    commit(request: EncounterRequest, user: UserDB): Promise<EncounterCommit>;
    snapshot(): TState;
    cleanup(): Promise<void>;
}

export abstract class BaseEncounterEngine<
    TState extends AnySystemEncounterState & BaseEncounterState
> implements IEncounterEngine<TState> {
    protected state: TState;
    private operationsByRequestId = new Map<string, EncounterOperation>();
    private readonly MAX_DEDUPED_REQUESTS = 500;
    
    constructor(
        initialState: TState,
        private readonly createRequestHandler: (state: TState) => IRequestHandler
    ) {
        this.state = structuredClone(initialState);
    }
    
    async dispatch(request: EncounterRequest, user: UserDB): Promise<EncounterOperation> {
        return (await this.commit(request, user)).operation;
    }

    async commit(request: EncounterRequest, user: UserDB): Promise<EncounterCommit> {
        const existingOperation = this.operationsByRequestId.get(request.requestId);
        if (existingOperation) {
            return { operation: existingOperation, currentEncounterChangedIn: null };
        }

        const draft = structuredClone(this.state);
        const requestHandler = this.createRequestHandler(draft);
        const appliedEvents = await requestHandler.parseRequest(request, user);
        draft.version = this.state.version + 1;
        const operation: EncounterOperation = {
            encounterId: request.encounterId,
            operationId: crypto.randomUUID(),
            causedByRequestId: request.requestId,
            version: draft.version,
            createdAt: new Date().toISOString(),
            appliedEvents,
        };

        // Every operation is stored before it takes effect: a failed write leaves the engine
        // unchanged, and a restart never loses an acknowledged change.
        const currentEncounterChangedIn = await this.persistOperation(this.state, draft);
        const previous = this.state;
        this.state = draft;
        this.rememberOperation(request.requestId, operation);

        // What follows is derived from the stored state (list status, carried-over values), so a
        // failure here must not undo an operation that is already stored and acknowledged.
        try {
            if (draft.phase !== previous.phase) {
                await this.persistStatus(STATUS_BY_PHASE[draft.phase]);
            }
            await this.afterCommit(previous, draft);
        } catch (error) {
            console.error(`Follow-up work failed for encounter ${draft.id}`, error);
        }

        return { operation, currentEncounterChangedIn };
    }

    /**
     * Store the new state. A start or reset also changes the campaign's current encounter: the
     * snapshot, the membership and the selection then commit in one transaction, so a failed start
     * leaves the encounter in setup and the players on what they were shown before.
     */
    private async persistOperation(previous: TState, draft: TState): Promise<number | null> {
        const change = selectionChange(previous.phase, draft.phase);
        const store = async (transaction?: SqlExecutor) => {
            await this.persistSnapshot(draft, transaction);
            if (!sameCopies(this.entityCopies(previous), this.entityCopies(draft))) {
                await this.persistMembership(draft, transaction);
            }
        };
        if (change === null) {
            await store();
            return null;
        }
        return this.inTransaction(async (transaction) => {
            await store(transaction);
            return this.persistSelection(change, draft.id, transaction);
        });
    }
    
    snapshot(): TState {
        return structuredClone(this.state);
    }

    /**
     * Called when the encounter is being unloaded. The state is already stored after every
     * operation; this write is a final safety net.
     */
    async cleanup(): Promise<void> {
        await this.persistSnapshot(this.state);
        await this.persistMembership(this.state);
    }

    private rememberOperation(requestId: string, operation: EncounterOperation): void {
        if (this.operationsByRequestId.size >= this.MAX_DEDUPED_REQUESTS) {
            const firstRequestId = this.operationsByRequestId.keys().next().value;
            if (firstRequestId) {
                this.operationsByRequestId.delete(firstRequestId);
            }
        }

        this.operationsByRequestId.set(requestId, operation);
    }

    /** `transaction`: given when the snapshot must commit together with other changes. */
    protected abstract persistSnapshot(state: TState, transaction?: SqlExecutor): Promise<void>;

    /** How many copies of each entity (by entity ID) the state contains. */
    protected abstract entityCopies(state: TState): Map<number, number>;

    /** Keep core.encounter_entities in step with the state's membership. */
    protected async persistMembership(state: TState, transaction?: SqlExecutor): Promise<void> {
        await encounterModel.replaceEncounterEntities(state.id, this.entityCopies(state), transaction);
    }

    /** One transaction on the core pool; the system schemas are on the same server. */
    protected inTransaction<T>(task: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        return withTransaction(corePool, task);
    }

    /** Returns the campaign whose selection changed, or null. */
    protected async persistSelection(
        change: Exclude<SelectionChange, null>,
        encounterId: number,
        transaction: SqlExecutor,
    ): Promise<number | null> {
        return change === "select"
            ? currentEncounterModel.setCurrentEncounter(transaction, encounterId)
            : currentEncounterModel.clearIfCurrent(transaction, encounterId);
    }

    /** System-specific follow-up after an operation is stored, for example carrying values over. */
    protected async afterCommit(_previous: TState, _next: TState): Promise<void> {}

    protected async persistStatus(status: CoreEncounter["status"]): Promise<void> {
        await encounterModel.updateEncounter(this.state.id, { status });
    }
}

function sameCopies(a: Map<number, number>, b: Map<number, number>): boolean {
    if (a.size !== b.size) return false;
    for (const [entityId, copies] of a) {
        if (b.get(entityId) !== copies) return false;
    }
    return true;
}
