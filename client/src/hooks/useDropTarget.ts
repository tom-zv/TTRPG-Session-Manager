import { useState, useCallback } from 'react';
import { 
  createDropHandlers, 
  DropContext,
  allowDropEffect
} from 'src/utils/dragDropUtils.js';

export interface DropTargetOptions<T, D = any> {
  acceptedTypes: string[];
  onItemsDropped: (items: T[], context: DropContext<D>) => Promise<void>;
  
  initialDestination?: D;
  initialIndex?: number;
  transformItems?: (sourceItems: any[]) => T[];
  calculateDropIndex?: (e: React.DragEvent<HTMLElement>) => number | undefined;
  calculateDestination?: (e: React.DragEvent<HTMLElement>) => D | undefined;
  onError?: (error: Error) => void;
}

export function useDropTarget<T, D = any>({
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
  const [dragCount, setDragCount] = useState<number>(0);
  const [dropIndex, setDropIndex] = useState<number | undefined>(initialIndex);
  const [destination, setDestination] = useState<D | undefined>(initialDestination);
  
  // Reset state when dragging ends
  const updateDragState = useCallback((isDragging: boolean, count: number) => {
    setIsDraggingOver(isDragging);
    setDragCount(count);
    if (!isDragging) {
      setDropIndex(initialIndex);
      setDestination(initialDestination);
    }
  }, [initialIndex, initialDestination]);

  // Get the current context values
  const getCurrentContext = useCallback(() => {
    return { 
      destination,
      index: dropIndex
    };
  }, [dropIndex, destination]);

  // Create handlers using our utility
  const handlers = createDropHandlers<T, D>({
    acceptedTypes,
    transformItems,
    onError,
    onItemsDropped,
  }, updateDragState, getCurrentContext);
  
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
    onDragEnter: handlers.onDragEnter,
    onDragLeave: handlers.onDragLeave,
    onDrop: handlers.onDrop,
    
    // Convenience prop object for drop zone elements
    dropAreaProps: {
      onDragOver: enhancedOnDragOver,
      onDragEnter: handlers.onDragEnter,
      onDragLeave: handlers.onDragLeave,
      onDrop: handlers.onDrop,
      className: isDraggingOver ? 'drop-target active' : '',
      'data-count': dragCount > 0 ? dragCount.toString() : undefined
    }
  };
}
