import { useState, useCallback } from 'react';

interface SelectionOptions<T> {
  // Function to extract the unique ID from an item
  getItemId: (item: T) => number | string;
  // Optional: callback when selection changes
  onSelectionChange?: (selectedItems: T[]) => void;
  // Optional: Whether to allow multiple items to be selected
  allowMultiSelect?: boolean;
  // Optional: Special handling for different selection modes
  onSingleSelect?: (item: T, selectedItems: T[]) => T[];
}

/**
 * A hook for handling selection with support for single-select, multi-select (Ctrl/Cmd),
 * and range select (Shift)
 */
export function useSelection<T>(options: SelectionOptions<T>) {
  // Track selected items
  const [selectedItems, setSelectedItems] = useState<T[]>([]);
  // Track last selected item ID for range select functionality
  const [lastSelectedId, setLastSelectedId] = useState<number | string | null>(null);
  
  // Check if an item is selected
  const isSelected = useCallback((item: T) => {
    return selectedItems.some(i => options.getItemId(i) === options.getItemId(item));
  }, [selectedItems, options]);

  // Handle item selection
  const handleSelect = useCallback((
    item: T, 
    items: T[], // The full list of items for range selection
    isMultiSelect: boolean = false,
    isRangeSelect: boolean = false
  ) => {
    const { getItemId, allowMultiSelect = true, onSelectionChange, onSingleSelect } = options;
    const itemId = getItemId(item);
    
    // Simple multi-select (Ctrl/Cmd key)
    if (isMultiSelect && allowMultiSelect) {
      const itemIndex = selectedItems.findIndex(i => getItemId(i) === itemId);
      let newSelection: T[];
      
      if (itemIndex >= 0) {
        // Deselect if already selected
        newSelection = selectedItems.filter(i => getItemId(i) !== itemId);
      } else {
        // Add to selection
        newSelection = [...selectedItems, item];
      }
      
      setSelectedItems(newSelection);
      setLastSelectedId(itemId);
      
      if (onSelectionChange) {
        onSelectionChange(newSelection);
      }
    }
    else if (isRangeSelect && lastSelectedId !== null && allowMultiSelect) {
      // Find indices of current and last selected items
      const currentIndex = items.findIndex(i => getItemId(i) === itemId);
      const lastIndex = items.findIndex(i => getItemId(i) === lastSelectedId);
      
      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const itemsToSelect = items.slice(start, end + 1);
        
        // Create a new selection that includes both current selection and the range
        const newSelection = [...selectedItems];
        
        // Add items from the range that aren't already selected
        itemsToSelect.forEach(itemToAdd => {
          if (!newSelection.some(i => getItemId(i) === getItemId(itemToAdd))) {
            newSelection.push(itemToAdd);
          }
        });
        
        setSelectedItems(newSelection);
        setLastSelectedId(itemId);
        
        if (onSelectionChange) {
          onSelectionChange(newSelection);
        }
      } else {
        // If we can't find the items, just add the current item if not already selected
        if (!selectedItems.some(i => getItemId(i) === itemId)) {
          const newSelection = [...selectedItems, item];
          setSelectedItems(newSelection);
          
          if (onSelectionChange) {
            onSelectionChange(newSelection);
          }
        }
        setLastSelectedId(itemId);
      }
    }
    // Single select
    else {
      let newSelection: T[];
      
      if (onSingleSelect) {
        newSelection = onSingleSelect(item, selectedItems);
      } else {
        // Deselect if its the only item selected
        if (selectedItems.length === 1 && isSelected(item)) { 
          newSelection = [];
        }
        else newSelection = [item];
      }
      
      setSelectedItems(newSelection);
      setLastSelectedId(itemId);
      
      if (onSelectionChange) {
        onSelectionChange(newSelection);
      }
    }
  }, [selectedItems, isSelected, lastSelectedId, options]);
  
  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedItems([]);
    setLastSelectedId(null);
    
    if (options.onSelectionChange) {
      options.onSelectionChange([]);
    }
  }, [options]);
  
  

  return {
    selectedItems,
    handleSelect,
    clearSelection,
    isSelected
  };
}