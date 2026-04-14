import { LocalStateManager } from "./LocalStateManager.js";
import { SyncState } from "src/services/EditorSync/syncConfig.js";

/**
 * Base class for encounter actions
 * Each game system should extend this with their specific action modules
 * 
 * @template TState - The encounter state type for this system
 * @template TEvent - The event type for this system
 */
export abstract class EncounterActions<TState, TEvent> {
  constructor(
    protected stateManager: LocalStateManager<TState, TEvent>,
    protected encounterId: number,
    protected transmit?: (event: TEvent) => Promise<void>
  ) {}
  
  /**
   * Get the underlying state manager
   * Used by hooks to subscribe to state changes
   */
  getStateManager(): LocalStateManager<TState, TEvent> {
    return this.stateManager;
  }

  /**
   * Apply an event to the encounter state
   * @param event - The event to apply
   */
  applyEvent(event: TEvent): void {
    this.stateManager.applyEvent(this.encounterId, event);
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState | null {
    return this.stateManager.getSyncState();
  }

  /**
   * Force an immediate sync 
   */
  async forceSyncNow(): Promise<boolean> {
    return await this.stateManager.forceSyncNow();
  }

  async dispatch(event: TEvent): Promise<void> {
    this.stateManager.applyEvent(this.encounterId, event);
    if (this.transmit) await this.transmit(event);
  } 

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.stateManager.destroy();
  }
}
