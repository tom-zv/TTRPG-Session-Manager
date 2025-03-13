import React, { useEffect } from "react";
import type { AudioItem } from "../types.js";
import AudioItemDisplay from "../../AudioItemDisplay/AudioItemDisplay.js";
import { useDropTargetContext } from 'src/components/DropTargetContext/DropTargetContext.js';
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';

interface CollectionDetailProps {
  collection: AudioItem;
  collectionItems: AudioItem[];
  isLoading: boolean;
  error: string | null;
  onBackClick: () => void;
  onRemoveItem: (itemId: number) => Promise<void>;
  handleAddItem: (item: AudioItem) => Promise<void>;
  setError: (error: string | null) => void;
}

const CollectionDetail: React.FC<CollectionDetailProps> = ({
  collection,
  collectionItems,
  isLoading,
  error,
  onBackClick,
  onRemoveItem,
  handleAddItem
}) => {
  const { registerDropHandler, unregisterDropHandler } = useDropTargetContext();
  
  // Register our drop handler when component mounts
  useEffect(() => {
    // Transform function if needed
    const transformItems = (items: any[]): AudioItem[] => {
      return items.map(item => ({
        id: item.id,
        title: item.title,
        type: 'file',
        audioType: item.audioType || 'music',
        duration: item.duration
      }));
    };
    
    // Register with the standard zone ID
    registerDropHandler<AudioItem>(
      DROP_ZONES.SOUND_MANAGER_CONTENT, // Use the content area as drop zone
      ['audio-file'],
      async (items) => {
        for (const item of items) {
          await handleAddItem(item);
        }
      },
      { transformItems }
    );
    
    // Clean up when unmounting
    return () => unregisterDropHandler(DROP_ZONES.SOUND_MANAGER_CONTENT);
  }, [registerDropHandler, unregisterDropHandler, handleAddItem]);

  return (
    <div>
      <div className="collection-detail-header">
        <button className="back-button" onClick={onBackClick}>
          ←
        </button>
        <h2>{collection.title}</h2>
        {collection.description && (
          <p className="collection-description">{collection.description}</p>
        )}
      </div>

      <AudioItemDisplay
        items={collectionItems}
        isLoading={isLoading}
        error={error}
        view="list"
        showToggle={false}
        showActions={true}
        title={`Items in ${collection.title}`}
        onRemoveItem={(itemId) => {
          onRemoveItem(itemId);
        }}
      />
    </div>
  );
};

export default CollectionDetail;
