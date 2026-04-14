import { QueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { EditorSyncManager } from "src/services/EditorSync/EditorSyncManager.js";
import { EncounterSyncConfig, SyncState } from "src/services/EditorSync/syncConfig.js";

/**
 * Generic interface for event processors
 */
export interface EventProcessor<TState, TEvent> {
  applyEvent(state: TState, event: TEvent): void;
}

/**
 * Query key generator for encounter state
 */
export interface QueryKeyProvider {
  state(encounterId: number, ...args: unknown[]): readonly unknown[];
}

/**
 * Save function for syncing state to server
 */
export type SaveFunction<TState> = (encounterId: number, state: TState) => Promise<void>;

/**
 * Sync state callback for UI updates
 */
export type SyncStateCallback = (syncState: SyncState) => void;

/**
 * Generic Local State Manager for encounter editing
 * 
 * @template TState - The encounter state type for this system
 * @template TEvent - The event type for this system
 */
export class LocalStateManager<TState, TEvent> {
  private syncManager: EditorSyncManager<TState> | null = null;

  constructor(
    private queryClient: QueryClient,
    private eventProcessor: EventProcessor<TState, TEvent>,
    private queryKeys: QueryKeyProvider
  ) {}

  /**
   * Initialize sync manager for a specific encounter
   * Should be called when encounter data is loaded and sync is desired
   * 
   * @param encounterId - The encounter ID to sync
   * @param saveFunction - Function to save state to server
   * @param onSyncStateChange - Callback for sync state updates
   * @param syncConfig - Optional custom sync configuration
   */
  initializeSync(
    encounterId: number,
    saveFunction: SaveFunction<TState>,
    onSyncStateChange?: SyncStateCallback,
    syncConfig?: Partial<EncounterSyncConfig>
  ): void {
    if (this.syncManager) {
      console.warn('LocalStateManager: Sync already initialized');
      return;
    }

    this.syncManager = new EditorSyncManager<TState>(
      encounterId,
      saveFunction,
      syncConfig || {},
      onSyncStateChange
    );
  }

  /**
   * Clean up sync manager and perform final sync if needed
   */
  async destroy(): Promise<void> {
    if (this.syncManager) {
      await this.syncManager.destroy();
      this.syncManager = null;
    }
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState | null {
    return this.syncManager?.getSyncState() ?? null;
  }

  /**
   * Force an immediate sync 
   */
  async forceSyncNow(): Promise<boolean> {
    if (!this.syncManager) return false;
    return await this.syncManager.syncNow();
  }

  /**
   * Apply an event to the local state optimistically
   */
  private applyEventToState(
    encounterId: number, 
    event: TEvent, 
    processor: (state: TState, event: TEvent) => void
  ) {
    // Update state in cache and get the updated state
    const updated = this.queryClient.setQueryData<{ encounterState: TState; snapshotType: 'active' | 'initial' | 'live' }>(
      this.queryKeys.state(encounterId),
      (old) => {
        if (!old) return old;
        const updatedEncounterState = produce(old.encounterState, (draft) => {
          processor(draft as TState, event);
        }) as TState;
        return {
          ...old,
          encounterState: updatedEncounterState
        };
      }
    );

    // Notify sync manager with the updated state if enabled
    if (this.syncManager && updated) {
      this.syncManager.onStateChanged(updated.encounterState);
    }
  }

  /**
   * Apply a local event 
   */
  applyLocalEvent(encounterId: number, event: TEvent) {
    this.applyEventToState(encounterId, event, this.eventProcessor.applyEvent);
  }

  /**
   * Apply an event from the live operation stream
   */
  applyEvent(encounterId: number, event: TEvent) {
    this.applyEventToState(encounterId, event, this.eventProcessor.applyEvent);
  }
}
