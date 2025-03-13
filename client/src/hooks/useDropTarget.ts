import { useState, useCallback } from 'react';
import { createDropHandlers } from 'src/utils/dragDropUtils.js';

interface UseDropTargetOptions<T, D = any> {
  acceptedTypes: string[];
  onItemsDropped: (items: T[], destination?: D) => Promise<void>;
  destination?: D;
  transformItems?: (sourceItems: any[]) => T[];
  onError?: (error: Error) => void;
}

export function useDropTarget<T, D = any>({
  acceptedTypes,
  onItemsDropped,
  destination,
  transformItems,
  onError
}: UseDropTargetOptions<T, D>) {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [dragCount, setDragCount] = useState<number>(0);

  // Callback to update local drag state
  const updateDragState = useCallback((drag: boolean, count: number) => {
    setIsDraggingOver(drag);
    setDragCount(count);
  }, []);

  const handlers = createDropHandlers<T, D>(
    acceptedTypes,
    onItemsDropped,
    { transformItems, destination, onError },
    updateDragState
  );

  return {
    isDraggingOver,
    dragCount,
    ...handlers,
    // Convenience prop object for drop zone elements
    dropAreaProps: {
      onDragOver: handlers.onDragOver,
      onDragEnter: handlers.onDragEnter,
      onDragLeave: handlers.onDragLeave,
      onDrop: handlers.onDrop,
      className: isDraggingOver ? 'drop-target active' : '',
      'data-count': dragCount > 0 ? dragCount.toString() : undefined
    }
  };
}
