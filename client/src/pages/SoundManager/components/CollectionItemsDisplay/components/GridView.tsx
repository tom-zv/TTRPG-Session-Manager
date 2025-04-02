import React, { useRef, useState, useCallback, useMemo } from "react";
import { AudioItem, AudioItemActions, AudioCollection } from "../index.js";
import AudioItemCard from "./AudioItemCard/AudioItemCard.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { useItemDragDrop } from "../hooks/useItemDragDrop.js";
import { calculateCardDropTarget } from "src/utils/gridDropUtils.js";
import { Audio } from "../../AudioService/AudioContext.js";
import { isAudioFile } from "../../../types/AudioItem.js";
import CreateCollectionDialog from "../../../components/CollectionView/components/CreateCollectionDialog.js";
import { collectionNameFromType } from "../../../components/CollectionView/hooks/useCollections.js";
import "./GridView.css";

interface GridViewProps extends AudioItemActions, DragDropProps {
  // Data props
  collection: AudioCollection;
  // UI state props
  selectedItemIds?: number[];
  showActions?: boolean | null;
  showPlayButton?: boolean;
  // Event handlers
  onItemSelect?: (e: React.MouseEvent, itemId: number) => void;
  // Create collection action
  createCollection?: (name: string, description?: string) => void;
}

export const GridView: React.FC<GridViewProps> = ({
  // Data props
  collection,
  // UI state props
  showActions = false,
  selectedItemIds = [],
  // Action handlers
  onItemSelect,
  useAddItems,
  useRemoveItems,
  useEditItem,
  // Collection creation
  createCollection,
  // Drag and drop props
  //isDragSource = false,
  isDropTarget = false,
  dropZoneId = null,
  acceptedDropTypes = [],
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const items = collection.items || [];

  const gridRef = useRef<HTMLDivElement>(
    null
  ) as React.MutableRefObject<HTMLDivElement | null>;
  const audioContext = Audio.useAudio();

  //console.log(`collection ${collection.id} is playing:`, audioContext.isAudioItemPlaying(collection));

  const {
    targetIndex: cardTargetIndex,
    dropAreaProps,
    dragItemProps,
  } = useItemDragDrop({
    items,
    selectedItemIds,
    contentType: collection.type === "macro" ? "macro" : "file",
    isDragSource: false,
    isDropTarget, 
    dropZoneId,
    acceptedDropTypes,
    containerRef: gridRef,
    useAddItems,
    calculateDropTarget: calculateCardDropTarget,
  });

  const { className: dropClassName, ...restDropProps } = dropAreaProps as {
    className?: string;
    [key: string]: any;
  };
  
  // Clean up class name handling
  const gridClasses = ['audio-item-grid', dropClassName]
    .filter(Boolean)
    .join(' ');

  const handleItemSelect = useCallback(
    (e: React.MouseEvent, itemId: number) => {
      if (onItemSelect) {
        onItemSelect(e, itemId);
      }
    },
    [onItemSelect]
  );

  const handlePlayItem = useCallback(
    (itemId: number) => {
      const item = items.find((item) => item.id === itemId);
      if (!item) return;

      audioContext.toggleAudioItem(item, collection);
    },
    [items, audioContext, collection]
  );

  // Handle the special case for the create button
  const handleCreateButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCreateDialogOpen(true);
  }, []);

  // Create the "Create New" item if createCollection is provided
  const createButtonItem = useMemo(() => {
    return createCollection
      ? ({
          id: -1,
          name: `Create New ${collectionNameFromType(collection.type).slice(0, -1)}`,
          type: collection.type,
          isCreateButton: true,
        } as AudioItem)
      : null;
  }, [createCollection, collection.type]);

  return (
    <>
      <div ref={gridRef} className={gridClasses} {...restDropProps}>
        {items.map((item, index) => {
          const isDropTarget = cardTargetIndex === index;
          const isSelected = selectedItemIds.includes(item.id);
          // Determine if the item is playing based on its type and collection context
          const isAmbienceActive =
            isAudioFile(item) &&
            item.active
          const isPlaying = audioContext.isAudioItemPlaying(item, collection);
          // Special handling for ambience files - they can be active even when not playing
          const itemDragProps = dragItemProps(item);

          return (
            <AudioItemCard
              key={item.id}
              item={item}
              collection={collection}
              isSelected={isSelected}
              isDropTarget={isDropTarget}
              isPlaying={isPlaying}
              isAmbienceActive={isAmbienceActive}
              showActions={!!showActions}
              selectedItemIds={selectedItemIds}
              dragItemProps={itemDragProps}
              onSelect={handleItemSelect}
              onPlayItem={handlePlayItem}
              useRemoveItems={useRemoveItems}
              useEditItem={useEditItem}
            />
          );
        })}

        {createButtonItem && (
          <AudioItemCard
            key={createButtonItem.id}
            item={createButtonItem}
            collection={collection}
            isSelected={false}
            isDropTarget={false}
            showActions={false}
            selectedItemIds={[]}
            dragItemProps={{}}
            onSelect={handleCreateButtonClick}
            onPlayItem={() => {}}
            useRemoveItems={useRemoveItems}
            useEditItem={useEditItem}
          />
        )}
      </div>

      {createCollection && (
        <CreateCollectionDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          collectionType={collection.type as any}
          createCollection={createCollection}
          isLoading={false}
        />
      )}
    </>
  );
};

export default GridView;
