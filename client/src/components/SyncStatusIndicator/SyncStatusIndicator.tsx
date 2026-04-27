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
  const [relativeTimeNow, setRelativeTimeNow] = useState<number | null>(null);
  const syncStartTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!syncState) {
      timeoutRef.current = window.setTimeout(() => {
        setDisplayStatus(null);
      }, 0);
      return undefined;
    }

    // If entering syncing state, record the start time
    if (syncState.status === SyncStatus.SYNCING && displayStatus !== SyncStatus.SYNCING) {
      syncStartTimeRef.current = Date.now();
      timeoutRef.current = window.setTimeout(() => {
        setDisplayStatus(SyncStatus.SYNCING);
      }, 0);
      return undefined;
    }

    // If leaving syncing state, ensure minimum duration
    if (syncState.status !== SyncStatus.SYNCING && displayStatus === SyncStatus.SYNCING) {
      const syncDuration = Date.now() - (syncStartTimeRef.current || 0);
      const remainingTime = Math.max(0, MIN_SYNCING_DURATION - syncDuration);

      timeoutRef.current = window.setTimeout(() => {
        setDisplayStatus(syncState.status);
        syncStartTimeRef.current = null;
      }, remainingTime);

      return undefined;
    }

    // For all other state changes, update immediately
    timeoutRef.current = window.setTimeout(() => {
      setDisplayStatus(syncState.status);
    }, 0);
    return undefined;
  }, [syncState, displayStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!syncState?.lastSyncTime) return undefined;

    const updateRelativeTime = () => setRelativeTimeNow(Date.now());
    const animationFrameId = window.requestAnimationFrame(updateRelativeTime);
    const intervalId = window.setInterval(updateRelativeTime, 10_000);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(intervalId);
    };
  }, [syncState?.lastSyncTime]);

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
    
    const referenceTime = relativeTimeNow ?? syncState.lastSyncTime;
    const diff = referenceTime - syncState.lastSyncTime;
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
