import React from "react";
import type { AudioItem, AudioCollection } from "../types.js";
import AudioItemsDisplay from "../../AudioItemDisplay/AudioItemsDisplay.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import './CollectionPackDetail.css';

interface CollectionPackDetailProps extends DragDropProps {
  collection: AudioCollection;
  collectionType: string;
  collectionItems: AudioItem[];
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
  collection,
  collectionType,
  collectionItems,
  isLoading,
  onBackClick,
  onRemoveItems,
  onAddItems,
  onUpdateItemPosition,
}) => {
  if (collectionType !== "pack") {
    return;
  }
  // Filter items by type
  const playlistItems = collectionItems.filter((item) => item.type === "playlist");
  const sfxItems = collectionItems.filter((item) => item.type === "sfx");
  const ambienceItems = collectionItems.filter((item) => item.type === "ambience");

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
          <AudioItemsDisplay
            items={playlistItems}
            collectionType={collectionType}
            isLoading={isLoading && playlistItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="Playlists"
            onAddItems={(items, position) => onAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* SFX Collections section */}
        <div className="pack-section">
          <h3>SFX Collections</h3>
          <AudioItemsDisplay
            items={sfxItems}
            collectionType={collectionType}
            isLoading={isLoading && sfxItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="SFX Collections"
            onAddItems={(items, position) => onAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* Ambience Collections section */}
        <div className="pack-section">
          <h3>Ambience Collections</h3>
          <AudioItemsDisplay
            items={ambienceItems}
            collectionType={collectionType}
            isLoading={isLoading && ambienceItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="Ambience Collections"
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
