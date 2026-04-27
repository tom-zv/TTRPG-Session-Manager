import { useState, useCallback, useRef } from 'react';
import { 
  DropContext,
  allowDropEffect,
  getDragCountFromEvent,
  processDropEvent,
} from 'src/utils/dragDropUtils.js';

export interface DropTargetOptions<T, D = unknown> {
  acceptedTypes: string[];
  onItemsDropped: (items: T[], context: DropContext<D>) => Promise<void>;
  
  initialDestination?: D;
  initialIndex?: number;
  transformItems?: (sourceItems: unknown[]) => T[];
  calculateDropIndex?: (e: React.DragEvent<HTMLElement>) => number | undefined;
  calculateDestination?: (e: React.DragEvent<HTMLElement>) => D | undefined;
  onError?: (error: Error) => void;
}

export function useDropTarget<T, D = unknown>({
  acceptedTypes,
  onItemsDropped,
  initialDestination,
  initialIndex,
  transformItems,
  calculateDropIndex,
  calculateDestination,
  onError
}: DropTargetOptions<T, D>) {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);
  const [dragCount, setDragCount] = useState<number>(0);
  const [dropIndex, setDropIndex] = useState<number | undefined>(initialIndex);
  const [destination, setDestination] = useState<D | undefined>(initialDestination);
  
  // Reset state when dragging ends
  const updateDragState = useCallback((isDragging: boolean, count: number) => {
    if (isDragging) {
      dragCounterRef.current += 1;
    } else {
      dragCounterRef.current -= 1;
    }
    
    // Only update the visual state when truly entering or leaving the entire component
    const isDragOver = dragCounterRef.current > 0;
    setIsDraggingOver(isDragOver);
    setDragCount(count);
    
    if (!isDragOver) {
      setDropIndex(initialIndex);
      setDestination(initialDestination);
    }
  }, [initialIndex, initialDestination]);

  // Add this new function to forcibly reset the counter
  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    setDragCount(0);
    setDropIndex(initialIndex);
    setDestination(initialDestination);
  }, [initialIndex, initialDestination]);

  // Get the current context values
  const getCurrentContext = useCallback(() => {
    return { 
      destination,
      index: dropIndex
    };
  }, [dropIndex, destination]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    updateDragState(true, getDragCountFromEvent(e));
  }, [updateDragState]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    updateDragState(false, 0);
  }, [updateDragState]);
  
  // Create an enhanced drop handler that ensures counter reset
  const enhancedOnDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
    const context = getCurrentContext();

    // Complete reset of drag counter before handling the drop
    resetDragState();
    
    e.preventDefault();
    e.stopPropagation();

    await processDropEvent<T, D>(e, acceptedTypes, onItemsDropped, {
      transformItems,
      onError,
      ...context,
    });
  }, [
    acceptedTypes,
    getCurrentContext,
    onError,
    onItemsDropped,
    resetDragState,
    transformItems,
  ]);

  // Combined onDragOver that handles both default behavior and calculations
  const enhancedOnDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    // Handle default drag behavior
    allowDropEffect(e);
    //console.log('DragOver event');
    // Calculate and update drop index if needed
    if (calculateDropIndex) {
      const newIndex = calculateDropIndex(e);
      if (typeof newIndex === 'number' && newIndex !== dropIndex) {
        setDropIndex(newIndex);
      }
    }
    
    // Calculate and update destination if needed
    if (calculateDestination) {
      const newDestination = calculateDestination(e);
      if (newDestination !== destination) {
        setDestination(newDestination);
      }
    }
  }, [calculateDropIndex, dropIndex, calculateDestination, destination]);

  return {
    isDraggingOver,
    dragCount,
    dropIndex,
    destination,
    setDropIndex,
    setDestination,
    onDragOver: enhancedOnDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: enhancedOnDrop, // Use the enhanced handler instead
    
    // Convenience prop object for drop zone elements
    dropAreaProps: {
      onDragOver: enhancedOnDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: enhancedOnDrop, // Use the enhanced handler here too
      className: isDraggingOver ? 'drop-target active' : '',
      'data-count': dragCount > 0 ? dragCount.toString() : undefined
    }
  };
}
