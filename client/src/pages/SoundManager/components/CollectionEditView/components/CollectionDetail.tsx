import React, { useEffect } from "react";
import type { AudioItem } from "../types.js";
import AudioItemDisplay from "../../AudioItemDisplay/AudioItemDisplay.js";
import CollectionPackDetail from "./CollectionPackDetail.js";
import { useDropTargetContext } from 'src/hooks/useDropTargetContext.js';
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';

interface CollectionDetailProps {
  // Data props
  collection: AudioItem;
  collectionType: string;
  collectionItems: AudioItem[];
  
  // UI state props
  isLoading: boolean;
  error: string | null;
  
  // Action handlers
  onBackClick: () => void;
  onRemoveItems: (itemIds: number[]) => Promise<void>;
  handleAddItems: (items: AudioItem[], position?: number) => Promise<void>;
  onUpdateItemPosition: (
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ) => Promise<void>;
  
  // Drag and drop props
  isDragSource?: boolean;
  isDropTarget?: boolean;
}

const CollectionDetail: React.FC<CollectionDetailProps> = ({
  collection,
  collectionType,
  collectionItems,
  isLoading,
  error,
  onBackClick,
  onRemoveItems,
  handleAddItems,
  onUpdateItemPosition,
  isDragSource = false,
  isDropTarget = false,
}) => {
  const { registerDropHandler, unregisterDropHandler } = useDropTargetContext();

  // Register our drop handler when component mounts
  useEffect(() => {
    // Transform function if needed
    const transformItems = (items: any[]): AudioItem[] => {
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        type: "file",
        fileType: item.fileType || "music",
        duration: item.duration,
      }));
    };

    // TODO move context drop-zone to ListView
    registerDropHandler<AudioItem>(
      DROP_ZONES.SOUND_MANAGER_CONTENT,
      ["file"],
      async (items) => {
        // Process all dropped items at once
        await handleAddItems(items);
      },
      { transformItems }
    );

    // Clean up when unmounting
    return () => unregisterDropHandler(DROP_ZONES.SOUND_MANAGER_CONTENT);
  }, [registerDropHandler, unregisterDropHandler, handleAddItems]);


  if (collectionType === "pack") {
    return (
      <CollectionPackDetail
        collection={collection}
        collectionType={collectionType}
        collectionItems={collectionItems}
        isLoading={isLoading}
        onBackClick={onBackClick}
        onRemoveItems={onRemoveItems}
        handleAddItems={handleAddItems}
        onUpdateItemPosition={onUpdateItemPosition}
        isDragSource={isDragSource}
        isDropTarget={isDropTarget}
      />
    );
  }

  return ( 
    <div className="collection-detail-view">
      <div className="collection-detail-header">
        <button className="back-button" onClick={onBackClick}>
          ←
        </button>
        <h2>{collection.name}</h2>
        {collection.description && (
          <p className="collection-description">{collection.description}</p>
        )}
      </div>
      <div className="collection-detail-view-content">

        <AudioItemDisplay
          items={collectionItems}
          itemType={'file'}
          isLoading={isLoading}
          error={error}
          view="list"
          showToggle={false}
          showActions={true}
          name={`Items in ${collection.name}`}
          onAddItems={(items, position) => handleAddItems(items, position)}
          onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
          onUpdateItemPosition={onUpdateItemPosition}
          isDragSource={isDragSource}
          isDropTarget={isDropTarget}
          dropZoneId={DROP_ZONES.SOUND_MANAGER_CONTENT}
          acceptedDropTypes={["file"]}
        />
        
      </div>
    </div>
  );
};

export default CollectionDetail;
