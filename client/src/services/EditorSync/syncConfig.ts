/**
 * Configuration for encounter state synchronization in the editor
 * Balances data safety with efficiency by avoiding full snapshot saves on every small edit
 * 
 */

export interface EncounterSyncConfig {
  /** Maximum number of pending edits/changes before forcing a sync */
  maxPendingOperations: number;
  
  /** Maximum time in milliseconds between syncs (periodic save) */
  maxTimeBetweenSyncs: number;
  
  /** Debounce time in milliseconds before syncing after last edit */
  debounceTime: number;
  
  /** Whether to sync on component unmount / user exit */
  syncOnUnmount: boolean;
  
  /** Whether to sync before sending commands that depend on server state */
  syncBeforeCriticalCommands: boolean;
}

/**
 * Default sync configuration for encounter editor
 * - Syncs after 10 changes (e.g., 10 HP edits, name changes, entity additions, etc.)
 * - Syncs every 2 minutes regardless of activity
 * - Debounces edits by 3 seconds (waits 3s after last edit before syncing)
 * - Always syncs on unmount/exit
 */
export const DEFAULT_SYNC_CONFIG: EncounterSyncConfig = {
  maxPendingOperations: 10,
  maxTimeBetweenSyncs: 2 * 60 * 1000, // 2 minutes
  debounceTime: 3000, // 3 seconds
  syncOnUnmount: true,
  syncBeforeCriticalCommands: true,
};

/**
 * Sync status for UI feedback
 */
export enum SyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending', // Has unsaved changes
  SYNCING = 'syncing', // Currently saving
  ERROR = 'error',
  OFFLINE = 'offline',
}

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: number | null;
  pendingOperations: number;
  error?: string;
}
