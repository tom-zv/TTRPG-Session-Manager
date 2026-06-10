import { AnySystemEncounterState, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
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
        this.state = draft;
        this.rememberOperation(request.requestId, operation);
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
