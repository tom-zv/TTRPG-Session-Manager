import React from "react";
import { AudioItemDisplayProps } from './types.js';
import GridView from './components/GridView.js';
import ListView from './components/ListView.js';
import ViewToggle from './components/ViewToggle.js';
import StatusMessages from './components/StatusMessages.js';
import { useAudioItems } from './hooks/useAudioItems.js';
import "./AudioItemDisplay.css";

export const AudioItemDisplay: React.FC<AudioItemDisplayProps> = ({
  items,
  itemType,
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
  renderSpecialItem,
  isDragSource = false,        
  isDropTarget = false,       
  dropZoneId,                 
  acceptedDropTypes = [], 
}) => {

  const {
    viewMode,
    setViewMode,
    selectedItemIds,
    handleItemSelection,
    handleRemoveItems
  } = useAudioItems({items, initialView: view, onItemClick, onRemoveItems
  });

  // Return status components if needed
  if (isLoading || error || items.length === 0) {
    return <StatusMessages isLoading={isLoading} error={error} isEmpty={items.length === 0} />;
  }

  // Shared props for view components
  const viewProps = {
    // Data props
    items,
    itemType,
    // UI state props
    selectedItemIds,
    showActions,
    showPlayButton: false, // Default for GridView
    // Action handlers
    onPlayItem,
    onEditItem,
    onAddItems,
    onRemoveItems: handleRemoveItems,
    onItemSelect: handleItemSelection,
    onUpdateItemPosition,
    // Render customization
    renderSpecialItem,
    // Drag and drop props
    isDragSource,
    isDropTarget,
    dropZoneId,
    acceptedDropTypes,
  };

  return (
    <div className="audio-item-display">
      <div className="audio-item-display-header">
        <ViewToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
          showToggle={showToggle}
        />
        {selectedItemIds.length > 0 && (
          <div className="selection-info">
            {selectedItemIds.length} item{selectedItemIds.length !== 1 ? 's' : ''} selected
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