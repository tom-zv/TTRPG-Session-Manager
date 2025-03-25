import { useCallback, useState } from 'react';

export type dragMode = 'file-transfer' | 'reorder';

interface UseDragSourceOptions<T> {
  contentType: any;
  mode: dragMode;
  getItemsForDrag: (selectedItemIds: number[]) => T[];
  getItemId: (item: T) => number;
  onDragStart?: (items: T[]) => void;
  onDragEnd?: () => void;
  // Optional function to get an item's display name for the drag image
  getItemName?: (item: T) => string;
}

export function useDragSource<T>({
  contentType,
  mode,
  getItemsForDrag,
  getItemId,
  onDragStart,
  onDragEnd,
  getItemName = (item: T) => `Item ${getItemId(item)}`
}: UseDragSourceOptions<T>) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Create a multi-file drag image
  const createMultiDragImage = (items: T[]): HTMLElement => {
    // Create container for drag image
    const container = document.createElement('div');
    container.className = 'drag-image-container';
    
    // Create a stack of "file" elements - limit to max 5 visual items
    const maxVisualItems = 10;
    const displayItems = items.slice(0, maxVisualItems);
    const hasMoreItems = items.length > maxVisualItems;
    
    // Add each item as a card in the stack
    displayItems.forEach((item, index) => {
      const itemElement = document.createElement('div');
      itemElement.className = `drag-image-item drag-item-stacked drag-item-${index + 1}`;
      itemElement.textContent = getItemName(item);
      
      container.appendChild(itemElement);
    });
    
    // Add count indicator if there are more items
    if (hasMoreItems) {
      const countIndicator = document.createElement('div');
      countIndicator.className = 'drag-count-indicator';
      countIndicator.textContent = `+${items.length - maxVisualItems} more`;
      
      container.appendChild(countIndicator);
    }
    
    document.body.appendChild(container);
    return container;
  };
  
  // Gets the items to be dragged, 
  const handleDragStart = useCallback((
    e: React.DragEvent, 
    item: T, 
    selectedItemIds: number[]
  ) => {
    e.stopPropagation();
    setIsDragging(true);
    
    // Determine if this is part of a multi-selection 
    const itemId = getItemId(item);
    const isMultiSelection = selectedItemIds.length > 1 && 
      selectedItemIds.includes(itemId);
      
    // Get items to be dragged based on selection
    const draggedItems = getItemsForDrag(selectedItemIds);
    
    // Create the payload
    const payload = {
      contentType,
      mode,
      items: draggedItems,
      count: draggedItems.length
    };
    
    console.log('Drag payload:', payload);

    // Set the data transfer
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    
    // Apply visual indicators
    if (isMultiSelection) {
      e.currentTarget.classList.add('dragging-multi');
      e.currentTarget.setAttribute('data-count', draggedItems.length.toString());
      
      // Create and set custom drag image for multiple items
      const dragImage = createMultiDragImage(draggedItems);
      e.dataTransfer.setDragImage(dragImage, 30, 30);
      
      // Clean up the drag image element after a short delay
      setTimeout(() => {
        document.body.removeChild(dragImage);
      }, 100);
    } else {
      e.currentTarget.classList.add('dragging');
    }
    
    if (onDragStart) {
      onDragStart(draggedItems);
    }
  }, [contentType, getItemsForDrag, getItemId, onDragStart, getItemName]);
  
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Reset dragging state
    setIsDragging(false);
    e.currentTarget.classList.remove('dragging');
    e.currentTarget.classList.remove('dragging-multi');
    
    if (onDragEnd) {
      onDragEnd();
    }
  }, [onDragEnd]);
  
  return {
    isDragging, 
    handleDragStart,
    handleDragEnd
  };
}