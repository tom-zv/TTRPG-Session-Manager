import React, { useState } from "react";
import { AudioItemDisplayProps } from './types.js';
import GridView from './components/GridView.js';
import ListView from './components/ListView.js';
import ViewToggle from './components/ViewToggle.js';
import StatusMessages from './components/StatusMessages.js';
import { useSelection } from "../../../../hooks/useSelection.js";
import "./AudioItemDisplay.css";

export const AudioItemDisplay: React.FC<AudioItemDisplayProps> = ({
  items,
  isLoading = false,
  error = null,
  view = "list",
  showToggle = false,
  showActions = false,
  onItemClick,
  onPlayItem,
  onAddItems,
  onEditItem,
  onRemoveItems,
  onUpdateItemPosition,
  renderSpecialItem
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(view);
  
  // Initialize selection functionality
  const { selectedItems, handleSelect, clearSelection } = useSelection<{ id: number; isCreateButton?: boolean }>({
    getItemId: (item) => item.id,
    // Don't select special items like "Create New" button
    onSingleSelect: (item, _) => {
      if (item.isCreateButton) {
        return [];
      }
      return [item];
    }
  });
  
  // Handle item selection with mouse event modifiers
  const handleItemSelection = (e: React.MouseEvent, itemId: number) => {
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
  };

  const handleRemoveItems = (itemIds: number[]) => {
    if (onRemoveItems) {
      onRemoveItems(itemIds);
    }

    clearSelection();
    
  };

  // Return status components if needed
  if (isLoading || error || items.length === 0) {
    return (
      <StatusMessages
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
      />
    );
  }

  // Shared props for view components
  const viewProps = {
    items,
    selectedItemIds: selectedItems.map(item => item.id),
    showActions,
    onPlayItem,
    onEditItem,
    onAddItems,
    onRemoveItems: handleRemoveItems,
    renderSpecialItem,
    onItemSelect: handleItemSelection,
    onUpdateItemPosition,
  };

  return (
    <div className="audio-item-display">
      <div className="audio-item-display-header">
        <ViewToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
          showToggle={showToggle}
        />
        
        {selectedItems.length > 0 && (
          <div className="selection-info">
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      {viewMode === "grid" 
        ? <GridView {...viewProps} /> 
        : <ListView {...viewProps} />
      }
    </div>
  );
};

export default AudioItemDisplay;