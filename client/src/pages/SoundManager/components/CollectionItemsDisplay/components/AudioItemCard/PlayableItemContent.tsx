import React, {useCallback, useState, useEffect} from 'react';
import { AudioItem, isAudioFile, isAudioCollection, AudioItemActions } from '../../types.js';
import ItemActions from '../ItemActions.js';
import type { AudioCollection } from '../../index.js';
import { Audio } from '../../../AudioService/AudioContext.js';


interface PlayableItemContentProps extends AudioItemActions {
  item: AudioItem;
  parentCollection: AudioCollection;
  showActions: boolean;
  selectedItemIds: number[];
  onPlayItem: (itemId: number) => void;
  isPlaying?: boolean;
}

const PlayableItemContent: React.FC<PlayableItemContentProps> = ({
  item,
  parentCollection,
  showActions,
  selectedItemIds,
  onPlayItem,
  useRemoveItems,
  isPlaying = false,
}) => {
  // Initialize volume state safely, defaulting to 1
  const [localVolume, setLocalVolume] = useState<number>(1);
  const { updateAudioItemVolume } = Audio.useAudio()
  
  // Update local volume when item changes, ensuring it's never undefined
  useEffect(() => {
    if (isAudioFile(item)) {
      // Set volume from item if it's a file and volume is defined, otherwise default to 1
      setLocalVolume(item.volume ?? 1); 
    } else {
      // Reset to default for non-files or if volume becomes undefined
      setLocalVolume(1); 
    }
  }, [item]); // Depend only on item, as item.volume changes would be part of item changing
  
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const newVolume = parseFloat(e.target.value);
      setLocalVolume(newVolume);
      // Ensure updateAudioItemVolume is called correctly
      updateAudioItemVolume(item, newVolume, parentCollection); 
    }, [item, parentCollection, updateAudioItemVolume]); // Add dependencies

  // Helper function to format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const date = new Date(seconds * 1000);
    return date.toISOString().slice(11, 19).replace(/^00:/, '').replace(/^0/, '');
  };

  return (
    <div className="playable-audio-item">
      <div className="playable-item-header">
        <div className="playable-item-title">
          <h4 className="audio-item-name">{item.name}</h4>
          {isAudioFile(item) && item.duration && (
            <span className="audio-item-duration">
              {formatDuration(item.duration)}
            </span>
          )}
          {isAudioCollection(item) && item.itemCount !== undefined && (
            <span className="audio-item-duration">{item.itemCount} items</span>
          )}
        </div>

        {showActions && (
          <div className="item-actions">
            <ItemActions
              item={item}
              collectionId={parentCollection.id}
              selectedItemIds={selectedItemIds}
              useRemoveItems={useRemoveItems}
              isSmall
            />
          </div>
        )}
      </div>

      <button
        className={`playable-item-play-button ${isPlaying ? "playing" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onPlayItem(item.id);
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <span className="play-icon">{isPlaying ? "◼" : "▶"}</span>
      </button>

      {!isAudioCollection(item) && (
        <input
        type="range"
        min="0" max="1" step="0.01"
        // Ensure value is always a number
        value={localVolume} 
        onChange={handleVolumeChange}
        className="volume-slider"
        aria-label="Volume"
      />
      )}
    </div>
  );
};

export default PlayableItemContent;