import React from "react";
import type { AudioItem, AudioCollection, CollectionType } from "../types.js";
import { CollectionItemsDisplay } from "../../CollectionItemsDisplay/CollectionItemsDisplay.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import './CollectionPackDetail.css';

// Helper function to create subcollection for display
const createSubcollection = (
  parentCollection: AudioCollection, 
  type: string, 
  title: string
): AudioCollection => {
  return {
    id: parentCollection.id, // Same ID as parent
    name: title,
    type: type as any, // Cast to the proper type
    items: parentCollection.items?.filter(item => item.type === type) || []
  };
};

interface CollectionPackDetailProps extends DragDropProps {
  collectionType: CollectionType;
  collectionId: number;
  isLoading: boolean;

  onBackClick: () => void;

  onRemoveItems: (itemIds: number[]) => Promise<void>;
  onAddItems: (items: AudioItem[], position?: number) => Promise<void>;

  onUpdateItemPosition: (
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ) => Promise<void>;
}

const CollectionPackDetail: React.FC<CollectionPackDetailProps> = ({
  collectionType,
  collectionId,
  isLoading,
  onBackClick,
  onRemoveItems,
  onAddItems,
  onUpdateItemPosition,
}) => {
  if (collectionType !== "pack") {
    return null;
  }
  
  // Create virtual subcollections by type
  const playlistCollection = createSubcollection(collection, "playlist", "Playlists");
  const sfxCollection = createSubcollection(collection, "sfx", "SFX Collections");
  const ambienceCollection = createSubcollection(collection, "ambience", "Ambience Collections");

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
        {/* Playlists section */}
        <div className="pack-section">
          <h3>Playlists</h3>
          <CollectionItemsDisplay
            collection={playlistCollection}
            isLoading={isLoading && playlistCollection.items!.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            onAddItems={(items, position) => onAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* SFX Collections section */}
        <div className="pack-section">
          <h3>SFX Collections</h3>
          <CollectionItemsDisplay
            collection={sfxCollection}
            isLoading={isLoading && sfxCollection.items!.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            onAddItems={(items, position) => onAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* Ambience Collections section */}
        <div className="pack-section">
          <h3>Ambience Collections</h3>
          <CollectionItemsDisplay
            collection={ambienceCollection}
            isLoading={isLoading && ambienceCollection.items!.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            onAddItems={(items, position) => onAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>
      </div>
    </div>
  );
};

export default CollectionPackDetail;
