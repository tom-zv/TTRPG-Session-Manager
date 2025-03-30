import React from "react";
import { AudioItemDisplayProps } from './types.js';
import GridView from './components/GridView.js';
import ListView from './components/ListView.js';
import MacroEditView from './components/MacroEditView.js'; // New import
import ViewToggle from './components/ViewToggle.js';
import StatusMessages from './components/StatusMessages.js';
import { useAudioItems } from './hooks/useAudioItems.js';
import { isAudioFile } from '../../types/AudioItem.js';
import "./AudioItemsDisplay.css";

/* AudioItemDisplay Component
 * This component is responsible for displaying a list of audio items in either a grid or list view.
 ******************************************************************************************************/

export const AudioItemsDisplay: React.FC<AudioItemDisplayProps> = ({
  items,
  collectionType,
  isLoading = false,
  isSelectable = true,
  error = null,
  view = "grid",
  showHeaders = true,
  showToggle = true,
  showActions = false,
  showPlayButton = false,
  onItemClick,
  onPlayItem,
  onAddItems,
  onEditItem,
  onRemoveItems,
  onUpdateItemPosition,
  renderSpecialItem,
  isDragSource = false,
  isReorderable = true,        
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
    collectionType,
    // UI state props
    selectedItemIds,
    showActions,
    showPlayButton,
    showHeaders, 
    // Action handlers
    onPlayItem,
    onAddItems,
    onRemoveItems: handleRemoveItems,
    onItemSelect: isSelectable ? handleItemSelection : undefined,
    onUpdateItemPosition,
    // Render customization
    renderSpecialItem,
    // Drag and drop props
    isDragSource,
    isReorderable,
    isDropTarget,
    dropZoneId,
    acceptedDropTypes,
  };

  // Filter items to only include AudioFiles for MacroEditView
  const audioFileItems = items.filter(isAudioFile);

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
            {selectedItemIds.length} item
            {selectedItemIds.length !== 1 ? "s" : ""} selected
          </div>
        )}
      </div>

      {/* Choose the view based on mode and item type */}
      {viewMode === "grid" ? (
        <GridView {...viewProps} />
      ) : collectionType === "macro" ? (
        <MacroEditView {...viewProps} collectionType="macro" items={audioFileItems} onEditItem={onEditItem} />
      ) : (
        <ListView {...viewProps} />
      )}
    </div>
  );
};

export default AudioItemsDisplay;