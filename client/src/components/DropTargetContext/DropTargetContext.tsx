import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createDropHandlers, DropHandlers } from 'src/utils/dragDropUtils.js';

/**
 * This context provider enables making any element a drop target by passing
 * the necessary drop-area props via context. It decouples the component that contains
 * the drop-handling logic from the component that renders the drop area, eliminating
 * the need to drill props through intermediate components.
 */

// Type for a drop handler function
type DropHandler<T = any> = (items: T[], destination?: any) => Promise<void>;

// Context type definitions
interface DropTargetContextType {
  registerDropHandler: <T>(
    zoneId: string,
    acceptedTypes: string[],
    handler: DropHandler<T>,
    options?: {
      destination?: any;
      transformItems?: (sourceItems: any[]) => T[];
    }
  ) => void;
  unregisterDropHandler: (zoneId: string) => void;
  getActiveDropZones: () => string[];
  isDropZoneActive: (zoneId: string) => boolean;
  handleDrop: (zoneId: string, e: React.DragEvent) => Promise<void>;
  handleDragOver: (zoneId: string, e: React.DragEvent) => void;
  handleDragEnter: (zoneId: string, e: React.DragEvent) => void;
  handleDragLeave: (zoneId: string, e: React.DragEvent) => void;
}

// Extended info stored for each drop zone
interface DropHandlerInfo {
  zoneId: string;
  acceptedTypes: string[];
  handler: DropHandler<any>;
  dropHandlers: DropHandlers;
  isDraggingOver: boolean;
  dragCount: number;
  transformItems?: (sourceItems: any[]) => any[];
  destination?: any;
}

const DropTargetContext = createContext<DropTargetContextType | null>(null);

export const DropTargetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Store all drop handlers by zone ID
  const handlersRef = useRef<Record<string, DropHandlerInfo>>({});
  const [, forceUpdate] = useState({});

  // Register a new drop zone and create its complete set of handlers
  const registerDropHandler = useCallback(<T,>(
    zoneId: string,
    acceptedTypes: string[],
    handler: DropHandler<T>,
    options?: {
      destination?: any;
      transformItems?: (sourceItems: any[]) => T[];
    }
  ) => {
    const dropHandlers = createDropHandlers<T>(
      acceptedTypes,
      handler,
      { transformItems: options?.transformItems, destination: options?.destination, zoneId }
      // No local update callback is provided in this context version.
    );
    handlersRef.current[zoneId] = {
      zoneId,
      acceptedTypes,
      handler,
      dropHandlers,
      isDraggingOver: false,
      dragCount: 0,
      transformItems: options?.transformItems,
      destination: options?.destination
    };
    forceUpdate({});
  }, []);

  const unregisterDropHandler = useCallback((zoneId: string) => {
    if (handlersRef.current[zoneId]) {
      delete handlersRef.current[zoneId];
      forceUpdate({});
    }
  }, []);

  const isDropZoneActive = useCallback((zoneId: string) => {
    return !!handlersRef.current[zoneId];
  }, []);

  const getActiveDropZones = useCallback(() => {
    return Object.keys(handlersRef.current);
  }, []);

  // Delegate event handling to the stored drop handlers
  const handleDragOver = useCallback((zoneId: string, e: React.DragEvent) => {
    const zone = handlersRef.current[zoneId];
    if (zone) {
      zone.dropHandlers.onDragOver(e);
      forceUpdate({});
    }
  }, []);

  const handleDragEnter = useCallback((zoneId: string, e: React.DragEvent) => {
    const zone = handlersRef.current[zoneId];
    if (zone) {
      zone.dropHandlers.onDragEnter(e);
      zone.isDraggingOver = true;
      zone.dragCount = 1; // Alternatively, getDragCountFromEvent(e) if needed.
      forceUpdate({});
    }
  }, []);

  const handleDragLeave = useCallback((zoneId: string, e: React.DragEvent) => {
    const zone = handlersRef.current[zoneId];
    if (zone) {
      zone.dropHandlers.onDragLeave(e);
      zone.isDraggingOver = false;
      zone.dragCount = 0;
      forceUpdate({});
    }
  }, []);

  const handleDrop = useCallback(async (zoneId: string, e: React.DragEvent) => {
    const zone = handlersRef.current[zoneId];
    if (zone) {
      await zone.dropHandlers.onDrop(e);
      zone.isDraggingOver = false;
      zone.dragCount = 0;
      forceUpdate({});
    }
  }, []);

  const contextValue: DropTargetContextType = {
    registerDropHandler,
    unregisterDropHandler,
    getActiveDropZones,
    isDropZoneActive,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave
  };

  return (
    <DropTargetContext.Provider value={contextValue}>
      {children}
    </DropTargetContext.Provider>
  );
};

export const useDropTargetContext = () => {
  const context = useContext(DropTargetContext);
  if (!context) {
    throw new Error('useDropTargetContext must be used within a DropTargetProvider');
  }
  return context;
};

interface DropAreaProps {
  zoneId: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}

export const DropArea: React.FC<DropAreaProps> = ({
  zoneId,
  className = '',
  activeClassName = 'drop-target-active',
  children
}) => {
  const { isDropZoneActive, handleDrop, handleDragOver, handleDragEnter, handleDragLeave } = useDropTargetContext();
  const isActive = isDropZoneActive(zoneId);

  return (
    <div
      onDrop={(e) => handleDrop(zoneId, e)}
      onDragOver={(e) => handleDragOver(zoneId, e)}
      onDragEnter={(e) => handleDragEnter(zoneId, e)}
      onDragLeave={(e) => handleDragLeave(zoneId, e)}
      className={`${className} ${isActive ? activeClassName : ''}`}
    >
      {children}
    </div>
  );
};
