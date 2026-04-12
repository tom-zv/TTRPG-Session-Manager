import { AnySystemEncounterState, SystemType } from "shared/domain/encounters/coreEncounter.js";
import { BaseEncounterState } from "shared/domain/encounters/coreEncounter.js";
import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { IStateCache, VersionedEvent } from "./stateCache.js";
import { ICommandHandler } from "./commandHandler.js";
import dnd5eEncounterService from "src/api/encounter/encounters/dnd5e/dnd5eEncounterService.js";

export interface IEncounterEngine<TState extends AnySystemEncounterState = AnySystemEncounterState> {
    dispatch(cmd: EncounterCommand): Promise<void>;
    snapshot(): TState;
    cleanup(): Promise<void>;
}

export abstract class BaseEncounterEngine<
  TState extends AnySystemEncounterState & BaseEncounterState,
  TEvent extends VersionedEvent = VersionedEvent
> implements IEncounterEngine<TState> {
    protected state: TState;
    protected stateCache: IStateCache<TState, TEvent>;
    protected commandHandler: ICommandHandler;
    
    constructor(
        initialState: TState,
        createStateCache: (state: TState) => IStateCache<TState, TEvent>,
        createCommandHandler: (state: TState, logEvent: (event: TEvent) => void) => ICommandHandler
    ) {
        this.state = initialState;
        this.stateCache = createStateCache(this.state);
        this.commandHandler = createCommandHandler(
            this.state,
            (event) => this.stateCache.logEvent(event)
            
        );
    }
    
    async dispatch(cmd: EncounterCommand): Promise<void> {
        const previousVersion = this.state.version;
        
        try {
            this.stateCache.logCommand(cmd);
            this.state.version++;
            
            this.commandHandler.parseCommand(cmd);
            
            await this.checkSnapshot();
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
}

export async function createEncounterEngine(system: SystemType, encounterId: number): Promise<IEncounterEngine> {
    let encounterState: AnySystemEncounterState | null = null;
    let EncounterEngineClass = null;

    if (system === 'dnd5e') {
        const { DnD5eEncounterEngine } = await import('./dnd5e/dnd5eEncounterEngine.js');
        // Load state
        const result = await dnd5eEncounterService.getEncounterState(encounterId);
        encounterState = result?.encounterState ?? null;
        EncounterEngineClass = DnD5eEncounterEngine;
    } else {
        throw new Error(`Unsupported system: ${system}`);
    }

    if (!encounterState) {
        throw new Error(`Encounter with ID ${encounterId} not found`);
    }

    return new EncounterEngineClass(encounterState);
}