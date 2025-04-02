import React, { useMemo } from "react";
import { AudioCollection, CollectionItemsDisplayProps } from "./types.js";
import GridView from "./components/GridView.js";
import ListView from "./components/ListView.js";
//import MacroEditView from "./components/MacroEditView.js"; // todo: re-implement macroEditView 
import ViewToggle from "./components/ViewToggle.js";
import StatusMessages from "./components/StatusMessages.js";
import { useAudioItems } from "./hooks/useAudioItems.js";
import {
  useGetCollectionById,
  useGetCollectionsOfType,
} from "../../api/collections/useCollectionQueries.js";
import "./CollectionItemsDisplay.css";
import { useCollectionMutations } from "./hooks/useCollectionMutations.js";

/* CollectionItemsDisplay Component
 * This component displays the contents of a collection (audio items) in either grid or list view.
 * When collectionId is -1, it acts as a "virtual collection" showing all collections of a type.
 ******************************************************************************************************/

export const CollectionItemsDisplay: React.FC<CollectionItemsDisplayProps> = ({
  collectionType,
  collectionId,
  isSelectable = true,
  view = "grid",
  showHeaders = true,
  showToggle = true,
  showActions = false,
  onItemClick,
  isDragSource = false,
  isReorderable = false,
  isDropTarget = false,
  dropZoneId,
  acceptedDropTypes = [],
}) => {
  const queryResult =
    collectionId == -1
      ? useGetCollectionsOfType(collectionType)
      : useGetCollectionById(collectionType, collectionId);

  const { data, isLoading, error } = queryResult;

  const collection = useMemo(() => {
    return (data as AudioCollection) || {
      items: [],
      type: collectionType,
      id: collectionId || -1,
      name: "",
    };
  }, [data, collectionType, collectionId]);
    
  const items = collection.items || [];
  const {
    viewMode,
    setViewMode,
    selectedItemIds,
    handleItemSelection,
    clearSelection,
  } = useAudioItems({
    items,
    initialView: view,
    onItemClick,
  });

  const {
    addItemsMutation,
    removeItemsMutation,
    updateItemPositionsMutation,
    createCollection,
  } = useCollectionMutations(collectionId, collectionType, {
    onRemoveSuccess: clearSelection,
  });

  // Check for virtual collections
  const isVirtualCollection = collection.id < 0;

  // Shared props for view components
  const viewProps = useMemo(
    () => ({
      // Data prop
      collection,
      // UI state props
      selectedItemIds,
      showActions,
      showHeaders,
      // Event handlers
      useAddItems: addItemsMutation,
      useRemoveItems: removeItemsMutation,
      onItemSelect: isSelectable ? handleItemSelection : undefined,
      useUpdateItemPosition: updateItemPositionsMutation,
      // Create collection functionality
      createCollection: createCollection,
      // Drag and drop props 
      isDragSource: isDragSource,
      isReorderable: isVirtualCollection ? false : isReorderable,
      isDropTarget: isDropTarget,
      dropZoneId: isVirtualCollection ? null : dropZoneId,
      acceptedDropTypes: acceptedDropTypes,
    }),
    [
      collection,
      selectedItemIds,
      showActions,
      showHeaders,
      addItemsMutation,
      removeItemsMutation,
      updateItemPositionsMutation,
      handleItemSelection,
      isSelectable,
      createCollection,
      isVirtualCollection,
      isDragSource,
      isReorderable,
      isDropTarget,
      dropZoneId,
      acceptedDropTypes,
    ]
  );

  // Status message component for displaying loading, error or empty states
  const statusMessageElement = useMemo(() => {
    if (isLoading || error || items.length === 0) {
      return (
        <div className="collection-status-messages">
          <StatusMessages
            isLoading={isLoading}
            error={error}
            isEmpty={items.length === 0}
          />
        </div>
      );
    }
    return null;
  }, [isLoading, error, items.length]);

  return (
    <div className="collection-items-display">
      <div className="collection-items-display-header">
        <ViewToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
          showToggle={showToggle}
        />

        {selectedItemIds.length > 0 && (
          <div className="selection-info">
            {selectedItemIds.length}{" "}
            {isVirtualCollection ? "collection" : "item"}
            {selectedItemIds.length !== 1 ? "s" : ""} selected
          </div>
        )}
      </div>

      {statusMessageElement}

      {viewMode === "grid" ? (
        <GridView {...viewProps} />
      ) : (
        <ListView {...viewProps} />
      )}
    </div>
  );
};

export default CollectionItemsDisplay;
