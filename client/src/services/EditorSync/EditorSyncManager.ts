import { 
  EncounterSyncConfig, 
  DEFAULT_SYNC_CONFIG, 
  SyncStatus, 
  SyncState 
} from "./syncConfig.js";

type SyncStateCallback = (syncState: SyncState) => void;

/**
 * Manages encounter state synchronization with the backend for the editor
 * 
 * Strategy:
 * - Batches small edits/changes and syncs periodically
 * - Syncs after X edits (configurable)
 * - Syncs every X minutes (configurable)
 * - Syncs on exit/unmount
 * - Provides sync status for UI feedback
 * - Stores latest applied state directly (no external getter needed)
 * 
 * @template TState - The encounter state type being synchronized
 */
export class EditorSyncManager<TState = unknown> {
  private config: EncounterSyncConfig;
  private encounterId: number;
  private saveFunction: (encounterId: number, state: TState) => Promise<void>;
  private onSyncStateChange?: SyncStateCallback;
  private latestState: TState | null = null;
  
  // Sync state
  private pendingOperations: number = 0;
  private lastSyncTime: number | null = null;
  private syncStatus: SyncStatus = SyncStatus.SYNCED;
  private lastError?: string;
  
  // Timers
  private periodicTimer: NodeJS.Timeout | null = null;
  
  // Flags
  private isSyncing: boolean = false;
  private isDestroyed: boolean = false;

  constructor(
    encounterId: number,
    saveFunction: (encounterId: number, state: TState) => Promise<void>,
    config: Partial<EncounterSyncConfig> = {},
    onSyncStateChange?: SyncStateCallback
  ) {
    this.encounterId = encounterId;
    this.saveFunction = saveFunction;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    this.onSyncStateChange = onSyncStateChange;
    
    // Don't start periodic timer until first change
  }

  /**
   * Called when a user edit is made
   * Stores the applied state and schedules a sync if needed
   * 
   * @param state - The state after the edit was applied
   */
  onStateChanged(state: TState): void {
    if (this.isDestroyed) return;
    
    // Store the latest state
    this.latestState = state;

    const wasZero = this.pendingOperations === 0;
    this.pendingOperations++;
    this.updateSyncStatus(SyncStatus.PENDING);
    
    // Start periodic timer on first pending operation
    if (wasZero) {
      this.startPeriodicSync();
    }
    
    // Check if we've hit the change threshold
    if (this.pendingOperations >= this.config.maxPendingOperations) {
      this.syncNow();
      return;
    }
  }

  /**
   * Force an immediate sync
   * Useful for critical operations or user-initiated saves
   */
  async syncNow(): Promise<boolean> {
    if (this.isDestroyed || this.isSyncing) return false;
    
    return await this.performSync();
  }

  /**
   * Sync and destroy the manager
   * Called on component unmount or when leaving the encounter
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    this.clearTimers();
    
    // Final sync if configured and there are pending changes
    if (this.config.syncOnUnmount && this.pendingOperations > 0) {
      await this.performSync();
    }
  }

  /**
   * Get current sync state for UI
   */
  getSyncState(): SyncState {
    return {
      status: this.syncStatus,
      lastSyncTime: this.lastSyncTime,
      pendingOperations: this.pendingOperations,
      error: this.lastError,
    };
  }

  // Private methods
  private async performSync(): Promise<boolean> {
    if (this.pendingOperations === 0) {
      return true; // Nothing to sync
    }

    const state = this.latestState;

    if (!state) {
      console.warn('EncounterSyncManager: No state to sync');
      return false;
    }

    this.isSyncing = true;
    this.updateSyncStatus(SyncStatus.SYNCING);

    try {
      await this.saveFunction(this.encounterId, state);
      
      this.pendingOperations = 0;
      this.lastSyncTime = Date.now();
      this.lastError = undefined;
      this.updateSyncStatus(SyncStatus.SYNCED);
      
      // Stop periodic timer when synced
      this.clearPeriodicTimer();
      
      return true;
    } catch (error) {
      console.error('EncounterSyncManager: Sync failed', error);
      this.lastError = error instanceof Error ? error.message : 'Sync failed';
      this.updateSyncStatus(SyncStatus.ERROR);
      
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  private startPeriodicSync(): void {
    // Clear any existing timer first
    this.clearPeriodicTimer();
    
    // Start periodic sync timer
    this.periodicTimer = setInterval(() => {
      if (this.pendingOperations > 0) {
        this.syncNow();
      }
    }, this.config.maxTimeBetweenSyncs);
  }

  private clearPeriodicTimer(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPeriodicTimer();
  }

  private updateSyncStatus(status: SyncStatus): void {
    this.syncStatus = status;
    
    if (this.onSyncStateChange) {
      this.onSyncStateChange(this.getSyncState());
    }
  }
}
