import { useState, useCallback } from 'react';
import { useSelection } from "../../../../../hooks/useSelection.js";
import type { AudioItem } from "../types.js";

interface UseAudioItemLogicOptions {
  items: AudioItem[];
  initialView: "grid" | "list";
  onItemClick?: (itemId: number) => void;
  onRemoveItems?: (itemIds: number[]) => void;
}

export function useAudioItems({
  items,
  initialView = "list",
  onItemClick,
  onRemoveItems
}: UseAudioItemLogicOptions) {
  // View state
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialView);
  
  // Selection state and handlers
  const { selectedItems, handleSelect, clearSelection } = useSelection<AudioItem>({
    getItemId: (item) => item.id,
  });
  
  // Handle item selection with mouse event modifiers
  const handleItemSelection = useCallback((e: React.MouseEvent, itemId: number) => {
    e.stopPropagation();
    
    // Find the item
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    // Don't handle selection for create buttons
    if (item.isCreateButton) {
      if (onItemClick) onItemClick(itemId);
      return;
    }
    
    const isMultiSelect = e.ctrlKey || e.metaKey;
    const isShiftSelect = e.shiftKey;
    
    // Use our selection hook
    handleSelect(item, items, isMultiSelect, isShiftSelect);
    
    // If it's a regular click (not multi/shift select) and we have an onClick handler,
    // also call that handler
    if (!isMultiSelect && !isShiftSelect && onItemClick) {
      onItemClick(itemId);
    }
  }, [items, onItemClick, handleSelect]);

  // Handle removing items, clearing selection
  const handleRemoveItems = useCallback((itemIds: number[]) => {
    if (onRemoveItems) {
      onRemoveItems(itemIds);
      clearSelection();
    }
  }, [onRemoveItems, clearSelection]);

  // Return all state and handlers that UI components need
  return {
    viewMode,
    setViewMode,
    selectedItems,
    selectedItemIds: selectedItems.map(item => item.id),
    handleItemSelection,
    handleRemoveItems
  };
}