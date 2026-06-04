import { AnySystemEncounterState, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { IStateCache } from "./stateCache.js";
import { IEventAuthorizer, IRequestHandler } from "./requestHandler.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";
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
    protected stateCache: IStateCache<TState>;
    private operationsByRequestId = new Map<string, EncounterOperation>();
    private readonly MAX_DEDUPED_REQUESTS = 500;
    
    constructor(
        initialState: TState,
        createStateCache: (state: TState) => IStateCache<TState>,
        private readonly createRequestHandler: (state: TState, eventAuthorizer: IEventAuthorizer) => IRequestHandler,
        private readonly createEventAuthorizer: (state: TState) => IEventAuthorizer
    ) {
        this.state = structuredClone(initialState);
        this.stateCache = createStateCache(this.state);
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

        const persist = this.stateCache.shouldSnapshot(draft.version) || this.shouldPersistOperation(this.state, draft, operation);
        if (persist) {
            await this.persistSnapshot(draft);
        }
        this.state = draft;
        this.stateCache.logOperation(operation);
        this.rememberOperation(request.requestId, operation);
        if (persist) this.stateCache.addSnapshot(draft);
        return operation;
    }
    
    snapshot(): TState {
        return structuredClone(this.state);
    }

    /**
     * Cleanup method called when encounter is ending or being unloaded.
     * Ensures final state is persisted to cache.
     */
    async cleanup(): Promise<void> {
        await this.persistSnapshot(this.state);
        this.stateCache.addSnapshot(this.state);
    }

    protected shouldPersistOperation(_previous: TState, _next: TState, _operation: EncounterOperation): boolean {
        return false;
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
}

export async function createEncounterEngine(system: SystemType, encounterId: number): Promise<IEncounterEngine> {
    let encounterState: AnySystemEncounterState | null = null;
    let EncounterEngineClass = null;

    if (system === 'dnd5e') {
        const { DnD5eEncounterEngine } = await import('./dnd5e/dnd5eEncounterEngine.js');
        // Load state
        encounterState = await dnd5eEncounterService.getEncounterState(encounterId);
        EncounterEngineClass = DnD5eEncounterEngine;
    } else {
        throw new Error(`Unsupported system: ${system}`);
    }

    if (!encounterState) {
        throw new Error(`Encounter with ID ${encounterId} not found`);
    }

    return new EncounterEngineClass(encounterState);
}
