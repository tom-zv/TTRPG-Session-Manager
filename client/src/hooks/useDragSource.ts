import { useCallback } from 'react';

interface UseDragSourceOptions<T> {
  contentType: string;
  getItemsForDrag: (selectedItemIds: number[]) => T[];
  getItemId: (item: T) => number;
  onDragStart?: (items: T[]) => void;
  onDragEnd?: () => void;
}

export function useDragSource<T>({
  contentType,
  getItemsForDrag,
  getItemId,
  onDragStart,
  onDragEnd
}: UseDragSourceOptions<T>) {
  
  const handleDragStart = useCallback((
    e: React.DragEvent, 
    item: T, 
    selectedItemIds: number[]
  ) => {
    e.stopPropagation();
    
    // Determine if this is part of a multi-selection 
    const itemId = getItemId(item);
    const isMultiSelection = selectedItemIds.length > 1 && 
      selectedItemIds.includes(itemId);
      
    // Get items to be dragged based on selection
    const draggedItems = getItemsForDrag(selectedItemIds);
    
    // Create the payload
    const payload = {
      contentType,
      mode: isMultiSelection ? 'multiple' : 'single',
      items: draggedItems,
      count: draggedItems.length
    };
    console.log('dragging files:',payload);
    
    // Set the data transfer
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    
    // Apply visual indicators
    if (isMultiSelection) {
      e.currentTarget.classList.add('dragging-multi');
      e.currentTarget.setAttribute('data-count', draggedItems.length.toString());
    } else {
      e.currentTarget.classList.add('dragging');
    }
    
    if (onDragStart) {
      onDragStart(draggedItems);
    }
  }, [contentType, getItemsForDrag, getItemId, onDragStart]);
  
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging');
    e.currentTarget.classList.remove('dragging-multi');
    
    if (onDragEnd) {
      onDragEnd();
    }
  }, [onDragEnd]);
  
  return {
    handleDragStart,
    handleDragEnd
  };
}