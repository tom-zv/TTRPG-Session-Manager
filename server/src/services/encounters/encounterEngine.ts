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
import { UserDB } from "src/api/users/types.js";

export interface IEncounterEngine<TState extends AnySystemEncounterState = AnySystemEncounterState> {
    dispatch(request: EncounterRequest, user: UserDB): Promise<EncounterOperation>;
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
        const existingOperation = this.operationsByRequestId.get(request.requestId);
        if (existingOperation) {
            return existingOperation;
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
        await this.persistSnapshot(draft);
        if (!sameCopies(this.entityCopies(this.state), this.entityCopies(draft))) {
            await this.persistMembership(draft);
        }
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

        return operation;
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

    protected abstract persistSnapshot(state: TState): Promise<void>;

    /** How many copies of each entity (by entity ID) the state contains. */
    protected abstract entityCopies(state: TState): Map<number, number>;

    /** Keep core.encounter_entities in step with the state's membership. */
    protected async persistMembership(state: TState): Promise<void> {
        await encounterModel.replaceEncounterEntities(state.id, this.entityCopies(state));
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
