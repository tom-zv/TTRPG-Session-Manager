import React, { useState, useEffect, useRef } from 'react';
import { SyncState, SyncStatus } from 'src/services/EditorSync/syncConfig.js';
import './SyncStatusIndicator.css';

interface SyncStatusIndicatorProps {
  syncState: SyncState | null;
}

const MIN_SYNCING_DURATION = 800; // Minimum time to show syncing animation (ms)

/**
 * Icon-only visual indicator for encounter sync status
 * Hover to see detailed status information
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ 
  syncState
}) => {
  const [displayStatus, setDisplayStatus] = useState<SyncStatus | null>(null);
  const syncStartTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!syncState) {
      setDisplayStatus(null);
      return;
    }

    // If entering syncing state, record the start time
    if (syncState.status === SyncStatus.SYNCING && displayStatus !== SyncStatus.SYNCING) {
      syncStartTimeRef.current = Date.now();
      setDisplayStatus(SyncStatus.SYNCING);
      return;
    }

    // If leaving syncing state, ensure minimum duration
    if (syncState.status !== SyncStatus.SYNCING && displayStatus === SyncStatus.SYNCING) {
      const syncDuration = Date.now() - (syncStartTimeRef.current || 0);
      const remainingTime = Math.max(0, MIN_SYNCING_DURATION - syncDuration);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setDisplayStatus(syncState.status);
        syncStartTimeRef.current = null;
      }, remainingTime);

      return;
    }

    // For all other state changes, update immediately
    setDisplayStatus(syncState.status);
  }, [syncState, displayStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!syncState || !displayStatus) {
    return null;
  }

  const getStatusIcon = () => {
    switch (displayStatus) {
      case SyncStatus.SYNCED:
        return '✓';
      case SyncStatus.PENDING:
        return '⟳';
      case SyncStatus.SYNCING:
        return '⟳';
      case SyncStatus.ERROR:
        return '✗';
      case SyncStatus.OFFLINE:
        return '⚠';
      default:
        return '?';
    }
  };

  const getStatusText = () => {
    switch (displayStatus) {
      case SyncStatus.SYNCED:
        return 'Saved';
      case SyncStatus.PENDING:
        return `${syncState.pendingOperations} unsaved change${syncState.pendingOperations > 1 ? 's' : ''}`;
      case SyncStatus.SYNCING:
        return 'Saving...';
      case SyncStatus.ERROR:
        return 'Save failed';
      case SyncStatus.OFFLINE:
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  const getLastSyncText = () => {
    if (!syncState.lastSyncTime) {
      return 'Never synced';
    }
    
    const now = Date.now();
    const diff = now - syncState.lastSyncTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (seconds < 10) {
      return 'Just now';
    } else if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else {
      return new Date(syncState.lastSyncTime).toLocaleTimeString();
    }
  };

  return (
    <div 
      className={`sync-status-indicator sync-status-${displayStatus}`}
    >
      <span className="sync-status-icon">{getStatusIcon()}</span>
      
      {/* Hover tooltip */}
      <div className="sync-status-tooltip">
        <div className="sync-status-main">{getStatusText()}</div>
        {displayStatus !== SyncStatus.SYNCING && (
          <div className="sync-status-time">Last sync: {getLastSyncText()}</div>
        )}
        {syncState.error && (
          <div className="sync-status-error">Error: {syncState.error}</div>
        )}
      </div>
    </div>
  );
};

export default SyncStatusIndicator;
