import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { IEncounterEngine, createEncounterEngine } from "./encounterEngine.js";

/**
 * Manages active encounter engine instances.
 * Handles creation, retrieval, and cleanup of encounter engines.
 * Supports multiple concurrent engines (e.g., for graceful transitions).
 */
export class EncounterEngineManager {
    private engines = new Map<number, IEncounterEngine>();
    private inactivityTimeouts = new Map<number, NodeJS.Timeout>();
    private readonly TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutes
    
    /**
     * Initialize or retrieve an encounter engine.
     * If an engine already exists for this encounter, it will be cleaned up first.
     */
    async initializeEngine(system: SystemType, encounterId: number): Promise<IEncounterEngine> {
        // Clean up existing engine if present
        const existingEngine = this.engines.get(encounterId);
        if (existingEngine) {
            await this.cleanupEngine(encounterId);
        }
        
        // Create new engine
        const engine = await createEncounterEngine(system, encounterId);
        this.engines.set(encounterId, engine);
        
        // Clear any existing timeout
        this.clearInactivityTimeout(encounterId);
        
        console.log(`Initialized encounter engine for encounter ${encounterId}`);
        return engine;
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
    async cleanupEngine(encounterId: number): Promise<void> {
        const engine = this.engines.get(encounterId);
        if (!engine) {
            return;
        }
        
        console.log(`Cleaning up encounter engine for encounter ${encounterId}`);
        
        // Clear any pending timeout
        this.clearInactivityTimeout(encounterId);
        
        // Persist final state
        await engine.cleanup();
        
        // Remove from active engines
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
            console.log(`Inactivity timeout reached for encounter ${encounterId}, cleaning up`);
            await this.cleanupEngine(encounterId);
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
