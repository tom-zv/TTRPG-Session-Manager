import {
    AnySystemEncounterState,
    BaseEncounterState,
    CoreEncounter,
    STATUS_BY_PHASE,
} from "shared/domain/encounters/coreEncounter.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { IEventAuthorizer, IRequestHandler } from "./requestHandler.js";
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
        private readonly createRequestHandler: (state: TState, eventAuthorizer: IEventAuthorizer) => IRequestHandler,
        private readonly createEventAuthorizer: (state: TState) => IEventAuthorizer
    ) {
        this.state = structuredClone(initialState);
    }
    
    async dispatch(request: EncounterRequest, user: UserDB): Promise<EncounterOperation> {
        const existingOperation = this.operationsByRequestId.get(request.requestId);
        if (existingOperation) {
            return existingOperation;
        }

        const draft = structuredClone(this.state);
        const requestHandler = this.createRequestHandler(draft, this.createEventAuthorizer(draft));
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
        const phaseChanged = draft.phase !== this.state.phase;
        this.state = draft;
        this.rememberOperation(request.requestId, operation);

        if (phaseChanged) {
            // The status column only mirrors the phase for encounter lists, so a failed write
            // must not undo an operation that is already stored.
            await this.persistStatus(STATUS_BY_PHASE[draft.phase]).catch((error) => {
                console.error(`Failed to update status of encounter ${draft.id}`, error);
            });
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

    protected async persistStatus(status: CoreEncounter["status"]): Promise<void> {
        await encounterModel.updateEncounter(this.state.id, { status });
    }
}
