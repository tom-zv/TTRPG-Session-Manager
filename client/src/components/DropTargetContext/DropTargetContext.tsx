import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { 
  createDropHandlers, 
  DropHandlers, 
  DropContext, 
  allowDropEffect 
} from 'src/utils/dragDropUtils.js';

/**
 * This context provider enables making any element a drop target by passing
 * the necessary drop-area props via context. It decouples the component that contains
 * the drop-handling logic from the component that renders the drop area, eliminating
 * the need to drill props through intermediate components.
 */

type DropHandler<T = any, D = any> = (items: T[], context: DropContext<D>) => Promise<void>;

// Context type definitions
interface DropTargetContextType {
  registerDropHandler: <T, D = any>(
    zoneId: string,
    acceptedTypes: string[],
    handler: DropHandler<T, D>,
    options?: {
      initialDestination?: D;
      initialIndex?: number;
      transformItems?: (sourceItems: any[]) => T[];
      calculateDropIndex?: (e: React.DragEvent) => number | undefined;
      onError?: (error: Error) => void;
    }
  ) => void;
  unregisterDropHandler: (zoneId: string) => void;
  // Separate functions for checking registration vs active state
  isDropZoneRegistered: (zoneId: string) => boolean;
  isDropZoneActive: (zoneId: string) => boolean;
  acceptedTypes: (zoneId: string) => string[];
  setDropZoneActiveStatus: (zoneId: string, status: boolean) => void;
  // Existing handlers
  handleDrop: (zoneId: string, e: React.DragEvent) => Promise<void>;
  handleDragOver: (zoneId: string, e: React.DragEvent) => void;
  handleDragEnter: (zoneId: string, e: React.DragEvent) => void;
  handleDragLeave: (zoneId: string, e: React.DragEvent) => void;
}

// Info stored for each drop zone
interface DropHandlerInfo<D = any> {
  zoneId: string;
  acceptedTypes: string[];
  handler: DropHandler<any, D>;
  dropHandlers: DropHandlers;
  isActive: boolean;      
  isDraggingOver: boolean;
  dragCount: number;
  destination?: D;
  index?: number;
  initialIndex?: number;
  transformItems?: (sourceItems: any[]) => any[];
  calculateDropIndex?: (e: React.DragEvent) => number | undefined;
  onError?: (error: Error) => void;
}

const DropTargetContext = createContext<DropTargetContextType | null>(null);

export const DropTargetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Store all drop handlers by zone ID
  const handlersRef = useRef<Record<string, DropHandlerInfo>>({});
  const [, forceUpdate] = useState({});

  // Register a new drop zone and create its complete set of handlers
  const registerDropHandler = useCallback(<T, D = any>(
    zoneId: string,
    acceptedTypes: string[],
    handler: DropHandler<T, D>,
    options?: {
      initialDestination?: D;
      initialIndex?: number;
      transformItems?: (sourceItems: any[]) => T[];
      calculateDropIndex?: (e: React.DragEvent) => number | undefined;
      onError?: (error: Error) => void;
    }
  ) => {
    // Create updater function for this specific zone
    const updateDragState = (isDragging: boolean, count: number) => {
      const zone = handlersRef.current[zoneId];
      if (zone) {
        zone.isDraggingOver = isDragging;
        zone.dragCount = count;
        if (!isDragging) {
          // Reset index when dragging ends
          zone.index = zone.initialIndex;
        }
        forceUpdate({});
      }
    };
    
    const getCurrentContext = () => {
      const zone = handlersRef.current[zoneId];
      return {
        destination: zone?.destination,
        index: zone?.index
      };
    };
    
    const dropHandlers = createDropHandlers<T, D>(
      {
        acceptedTypes,
        transformItems: options?.transformItems,
        onError: options?.onError,
        onItemsDropped: handler,
      },
      updateDragState,
      getCurrentContext
    );
    
    handlersRef.current[zoneId] = {
      zoneId,
      acceptedTypes,
      handler,
      dropHandlers,
      isActive: false, 
      isDraggingOver: false,
      dragCount: 0,
      destination: options?.initialDestination,
      index: options?.initialIndex,
      initialIndex: options?.initialIndex,
      transformItems: options?.transformItems,
      calculateDropIndex: options?.calculateDropIndex,
      onError: options?.onError
    };
    forceUpdate({});
  }, []);

  const unregisterDropHandler = useCallback((zoneId: string) => {
    if (handlersRef.current[zoneId]) {
      delete handlersRef.current[zoneId];
      forceUpdate({});
    }
  }, []);

  const isDropZoneRegistered = useCallback((zoneId: string) => {
    return !!handlersRef.current[zoneId];
  }, []);

  const isDropZoneActive = useCallback((zoneId: string) => {
    const zone = handlersRef.current[zoneId];
    return zone ? zone.isActive : false;
  }, []);

  const setDropZoneActiveStatus = useCallback((zoneId: string, status: boolean) => {
    const zone = handlersRef.current[zoneId];
    if (zone && zone.isActive !== status) {
      zone.isActive = status;
      forceUpdate({});
    }
  }, []);

  
  const acceptedTypes = useCallback((zoneId: string) => {
    const zone = handlersRef.current[zoneId];
    return zone ? zone.acceptedTypes : [];
  },[]);

  // Delegate event handling to the stored drop handlers
  const handleDragOver = useCallback((zoneId: string, e: React.DragEvent) => {
    const zone = handlersRef.current[zoneId];
    if (zone) {  
      // Call the standard allowDropEffect first
      allowDropEffect(e);
      
      // If we have a calculateDropIndex function, use it to update the current index
      if (zone.calculateDropIndex) {
        const newIndex = zone.calculateDropIndex(e);
        if (zone.index !== newIndex) {
          // Update the index for this zone
          zone.index = newIndex;
          forceUpdate({});
        }
      }
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
    
    isDropZoneRegistered,
    isDropZoneActive,
    acceptedTypes,
    setDropZoneActiveStatus,

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

// Update DropArea props to support both states
interface DropAreaProps {
  zoneId: string;
  className?: string;
  registeredClassName?: string;  
  activeClassName?: string;      
  children: React.ReactNode;
}

export const DropArea: React.FC<DropAreaProps> = ({
  zoneId,
  className = '',
  registeredClassName = 'drop-target-registered',
  activeClassName = 'drop-target-active',
  children
}) => {
  const { 
    isDropZoneRegistered,
    isDropZoneActive, 
    handleDrop, 
    handleDragOver, 
    handleDragEnter, 
    handleDragLeave 
  } = useDropTargetContext();
  
  const isRegistered = isDropZoneRegistered(zoneId);
  const isActive = isDropZoneActive(zoneId);

  return (
    <div
      onDrop={(e) => handleDrop(zoneId, e)}
      onDragOver={(e) => handleDragOver(zoneId, e)}
      onDragEnter={(e) => handleDragEnter(zoneId, e)}
      onDragLeave={(e) => handleDragLeave(zoneId, e)}
      className={`${className} ${isRegistered ? registeredClassName : ''} ${isActive ? activeClassName : ''}`}
    >
      {children}
    </div>
  );
};
