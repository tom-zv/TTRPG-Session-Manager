import React from "react";
import type { AudioItem } from "../types.js";
import AudioItemDisplay from "../../AudioItemDisplay/AudioItemDisplay.js";
import { DragDropProps } from "src/types/dragDropProps.js";

interface CollectionPackDetailProps extends DragDropProps {
  collection: AudioItem;
  collectionType: string;
  collectionItems: AudioItem[];
  isLoading: boolean;

  onBackClick: () => void;

  onRemoveItems: (itemIds: number[]) => Promise<void>;
  handleAddItems: (items: AudioItem[], position?: number) => Promise<void>;

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
  handleAddItems,
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
          <AudioItemDisplay
            items={playlistItems}
            itemType={collectionType}
            isLoading={isLoading && playlistItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="Playlists"
            onAddItems={(items, position) => handleAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* SFX Collections section */}
        <div className="pack-section">
          <h3>SFX Collections</h3>
          <AudioItemDisplay
            items={sfxItems}
            itemType={collectionType}
            isLoading={isLoading && sfxItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="SFX Collections"
            onAddItems={(items, position) => handleAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>

        {/* Ambience Collections section */}
        <div className="pack-section">
          <h3>Ambience Collections</h3>
          <AudioItemDisplay
            items={ambienceItems}
            itemType={collectionType}
            isLoading={isLoading && ambienceItems.length === 0}
            error={null}
            view="list"
            showToggle={false}
            showActions={true}
            name="Ambience Collections"
            onAddItems={(items, position) => handleAddItems(items, position)}
            onRemoveItems={(itemIds) => onRemoveItems(itemIds)}
            onUpdateItemPosition={onUpdateItemPosition}
          />
        </div>
      </div>
    </div>
  );
};

export default CollectionPackDetail;
