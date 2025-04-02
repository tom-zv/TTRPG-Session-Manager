import { useState, useCallback, useMemo } from 'react';
import { useSelection } from "../../../../../hooks/useSelection.js";
import type { AudioItem } from "../types.js";

interface UseAudioItemLogicOptions {
  items: AudioItem[];
  initialView?: "grid" | "list";
  onItemClick?: (itemId: number) => void;
}

export function useAudioItems({
  items,
  initialView = "list",
  onItemClick,
}: UseAudioItemLogicOptions) {
  // View state
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialView);
  
  const { selectedItems, handleSelect, clearSelection } = useSelection<AudioItem>({
    getItemId: (item) => item.id,
  });
  
  // Create a memoized array of selected item IDs
  const selectedItemIds = useMemo(() => 
    selectedItems.map(item => item.id), 
    [selectedItems]
  );
  
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
    
    if (isMultiSelect || isShiftSelect) {
      handleSelect(item, items, isMultiSelect, isShiftSelect);
    } else {
      clearSelection();
    }
    
    // After selection, trigger the parent click handler if provided
    if (onItemClick) {
      onItemClick(itemId);
    }
  }, [items, handleSelect, clearSelection, onItemClick]);
  
  return {
    viewMode,
    setViewMode,
    selectedItems,
    selectedItemIds,
    handleItemSelection,
    clearSelection,
  };
}