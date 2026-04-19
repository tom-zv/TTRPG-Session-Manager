import { AnySystemEncounterState, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
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
    protected requestHandler: IRequestHandler;
    
    constructor(
        initialState: TState,
        createStateCache: (state: TState) => IStateCache<TState>,
        createRequestHandler: (state: TState, eventAuthorizer: IEventAuthorizer) => IRequestHandler,
        createEventAuthorizer: (state: TState) => IEventAuthorizer
    ) {
        this.state = initialState;
        this.stateCache = createStateCache(this.state);
        const eventAuthorizer = createEventAuthorizer(this.state);
        this.requestHandler = createRequestHandler(this.state, eventAuthorizer);
    }
    
    async dispatch(request: EncounterRequest, user: UserDB): Promise<EncounterOperation> {
        const previousVersion = this.state.version;
        
        try {
            this.state.version++;

            const appliedEvents = this.requestHandler.parseRequest(request, user);
            const operation: EncounterOperation = {
                encounterId: request.encounterId,
                operationId: crypto.randomUUID(),
                causedByRequestId: request.requestId,
                version: this.state.version,
                createdAt: new Date().toISOString(),
                appliedEvents,
            };

            this.stateCache.logOperation(operation);
            
            await this.checkSnapshot();
            return operation;
        } catch (error) {
            // Rollback version on failure
            this.state.version = previousVersion;
            
            throw error;
        }
    }
    
    snapshot(): TState {
        return structuredClone(this.state);
    }

    /**
     * Cleanup method called when encounter is ending or being unloaded.
     * Ensures final state is persisted to cache.
     */
    async cleanup(): Promise<void> {
        await this.persistSnapshot();
        this.stateCache.addSnapshot(this.state);
    }

    protected async checkSnapshot(): Promise<void> {
        if (this.stateCache.shouldSnapshot(this.state.version)) {
            this.createSnapshot();
        }
    }
    
    protected createSnapshot(): void {
        this.stateCache.addSnapshot(this.state);
    }

    protected abstract persistSnapshot(): Promise<void>;
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