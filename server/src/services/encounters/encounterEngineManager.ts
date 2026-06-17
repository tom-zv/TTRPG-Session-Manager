import { IEncounterEngine } from "./encounterEngine.js";
import { loadEncounterEngine } from "./encounterSystems.js";
import encounterConnectionManager from "./encounterConnectionManager.js";

/**
 * Manages active encounter engine instances.
 * Handles creation, retrieval, and cleanup of encounter engines.
 * Supports multiple concurrent engines (e.g., for graceful transitions).
 */
export class EncounterEngineManager {
    private engines = new Map<number, IEncounterEngine>();
    private engineInitializations = new Map<number, Promise<IEncounterEngine>>();
    private inactivityTimeouts = new Map<number, NodeJS.Timeout>();
    private readonly TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutes
    
    /**
     * Returns the engine for this encounter, loading it from storage on first use.
     * Any command or join can be the first use; there is no separate "start" step.
     */
    async getOrLoadEngine(encounterId: number): Promise<IEncounterEngine> {
        const existingEngine = this.engines.get(encounterId);
        if (existingEngine) {
            this.clearInactivityTimeout(encounterId);
            return existingEngine;
        }

        const existingInitialization = this.engineInitializations.get(encounterId);
        if (existingInitialization) {
            this.clearInactivityTimeout(encounterId);
            return existingInitialization;
        }
        
        const initialization = loadEncounterEngine(encounterId)
            .then((engine) => {
                const currentEngine = this.engines.get(encounterId);
                if (currentEngine) {
                    return currentEngine;
                }

                this.engines.set(encounterId, engine);
                this.clearInactivityTimeout(encounterId);
                console.log(`Initialized encounter engine for encounter ${encounterId}`);
                return engine;
            })
            .finally(() => {
                if (this.engineInitializations.get(encounterId) === initialization) {
                    this.engineInitializations.delete(encounterId);
                }
            });

        this.engineInitializations.set(encounterId, initialization);
        return initialization;
    }
    
    /**
     * Get an active encounter engine by ID.
     * Returns null if no engine exists for this encounter.
     */
    getEngine(encounterId: number): IEncounterEngine | null {
        return this.engines.get(encounterId) ?? null;
    }
    
    /**
     * Check if an engine exists for the given encounter.
     */
    hasEngine(encounterId: number): boolean {
        return this.engines.has(encounterId);
    }
    
    /**
     * Get all active encounter IDs.
     */
    getActiveEncounterIds(): number[] {
        return Array.from(this.engines.keys());
    }
    
    /**
     * Clean up and remove an encounter engine.
     * Persists final state before removal.
     */
    async cleanupEngine(encounterId: number, options: { onlyIfInactive?: boolean } = {}): Promise<void> {
        const engine = this.engines.get(encounterId);
        if (!engine) {
            return;
        }

        if (options.onlyIfInactive && encounterConnectionManager.getUserCount(encounterId) > 0) {
            return;
        }
        
        console.log(`Cleaning up encounter engine for encounter ${encounterId}`);
        
        // Clear any pending timeout
        this.clearInactivityTimeout(encounterId);
        
        // Persist final state
        await engine.cleanup();
        
        if (options.onlyIfInactive && encounterConnectionManager.getUserCount(encounterId) > 0) {
            return;
        }

        // Remove from active engines only if this cleanup still owns the current engine.
        if (this.engines.get(encounterId) === engine) {
            this.engines.delete(encounterId);
        }
    }
    
    /**
     * Drop an engine without storing its state, for an encounter that no longer exists.
     */
    discardEngine(encounterId: number): void {
        this.clearInactivityTimeout(encounterId);
        this.engines.delete(encounterId);
    }

    /**
     * Start inactivity timeout for an encounter.
     * If timeout expires, the engine will be cleaned up.
     */
    startInactivityTimeout(encounterId: number): void {
        // Don't start timeout if engine doesn't exist
        if (!this.engines.has(encounterId)) {
            return;
        }
        
        // Clear existing timeout if any
        this.clearInactivityTimeout(encounterId);
        
        console.log(`Starting inactivity timeout for encounter ${encounterId}`);
        
        const timeout = setTimeout(async () => {
            if (encounterConnectionManager.getUserCount(encounterId) > 0) {
                return;
            }

            console.log(`Inactivity timeout reached for encounter ${encounterId}, cleaning up`);
            await this.cleanupEngine(encounterId, { onlyIfInactive: true });
        }, this.TIMEOUT_DURATION);
        
        this.inactivityTimeouts.set(encounterId, timeout);
    }
    
    /**
     * Clear inactivity timeout for an encounter.
     * Call this when users reconnect to the encounter.
     */
    clearInactivityTimeout(encounterId: number): void {
        const timeout = this.inactivityTimeouts.get(encounterId);
        if (timeout) {
            clearTimeout(timeout);
            this.inactivityTimeouts.delete(encounterId);
            console.log(`Cleared inactivity timeout for encounter ${encounterId}`);
        }
    }
    
    /**
     * Clean up all active engines.
     * Useful for graceful shutdown.
     */
    async cleanupAll(): Promise<void> {
        console.log(`Cleaning up all ${this.engines.size} active encounter engines`);
        
        const cleanupPromises = Array.from(this.engines.keys()).map(
            encounterId => this.cleanupEngine(encounterId)
        );
        
        await Promise.all(cleanupPromises);
    }
}

// Singleton instance
const encounterEngineManager = new EncounterEngineManager();

export default encounterEngineManager;
