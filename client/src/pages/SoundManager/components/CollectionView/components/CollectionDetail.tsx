import React, { useMemo } from "react";
import type { AudioItem, AudioCollection, CollectionType } from "../types.js";
import AudioItemsDisplay from "../../AudioItemDisplay/AudioItemsDisplay.js";
import CollectionPackDetail from "./CollectionPackDetail.js";
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';
import './CollectionDetail.css';


/* CollectionDetail.tsx
 * This component is responsible for displaying the details of a collection.
*****************************************************************************/

interface CollectionDetailProps {
  // Data props
  collection: AudioCollection;
  collectionType: CollectionType;
  collectionItems: AudioItem[];
  // UI state props
  itemDisplayView: 'list' | 'grid';
  isEditing: boolean;
  isLoading: boolean;
  error: string | null;
  // Action handlers
  onBackClick: () => void;
  onAddItems: (items: AudioItem[], position?: number) => Promise<void>;
  onEditItem: (itemId: number, params: any) => Promise<void>;
  onRemoveItems: (itemIds: number[]) => Promise<void>;
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
  
  itemDisplayView,
  isLoading,
  error,
  
  onBackClick,
  onRemoveItems,
  onEditItem,
  onAddItems,
  onUpdateItemPosition,
  isDragSource = false,
  isDropTarget = false,
}) => {

  if (collectionType === "pack") {
    return (
      <CollectionPackDetail
        collection={collection}
        collectionType={collectionType}
        collectionItems={collectionItems}
        isLoading={isLoading}
        onBackClick={onBackClick}
        onAddItems={onAddItems}
        onRemoveItems={onRemoveItems}
        onUpdateItemPosition={onUpdateItemPosition}
        isDragSource={isDragSource}
        isDropTarget={isDropTarget}
      />
    );
  }
  
  // Check if description is short enough to display inline
  const useInlineDescription = useMemo(() => {
    return collection.description && collection.description.length < 80;
  }, [collection.description]);
  
  return ( 
    <div className="collection-detail-view">
      <div className="collection-detail-header">
        <button className="back-button" onClick={onBackClick}>
          ←
        </button>
        
        <div className="collection-title-group">
          <h2>{collection.name}</h2>
          {useInlineDescription && collection.description && (
            <p className="collection-description-inline">{collection.description}</p>
          )}
        </div>
      </div>
      
      {!useInlineDescription && collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}
      
      <div className={`collection-detail-view-content ${itemDisplayView === "grid" ? "collection-detail-view-grid" : "collection-detail-view-list"}`}>
        
        <AudioItemsDisplay
          items={collectionItems}
          collectionType={collectionType}
          isLoading={isLoading}
          error={error}
          view={itemDisplayView}
          showToggle={false}
          showActions={true}
          showPlayButton={true}
          name={`Items in ${collection.name}`}
          onPlayItem={() => {console.log("Play item clicked");}}
          onAddItems={onAddItems}
          onEditItem={onEditItem}
          onRemoveItems={onRemoveItems}
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
