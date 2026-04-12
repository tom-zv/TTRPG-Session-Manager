import React, { useCallback, useState, useEffect } from "react";
import styles from './AudioItemCard.module.css';
import {
  AudioItem,
  isAudioFile,
  isAudioCollection,
  AudioItemActions,
  isAudioMacro,
  isSfxCollection,
} from "../../../types.js";
// import { getItemIcon } from "../../utils/getItemIcon.js";
import ItemActions from "../../ItemActions.js";
import type { AudioCollection } from "../../../types.js";
import {
  useAudioItemControls,
  useSfxAudio,
} from "src/pages/SoundManager/services/AudioService/AudioContext.js";

interface PlayableItemContentProps extends AudioItemActions {
  item: AudioItem;
  parentCollection: AudioCollection;
  showActions: boolean;
  selectedItemIds: number[];
  onPlayItem: (itemId: number) => void;
  isPlaying?: boolean;
  onEditItem?: (itemId: number) => void;
}

const PlayableItemContent: React.FC<PlayableItemContentProps> = ({
  item,
  parentCollection,
  showActions,
  selectedItemIds,
  onPlayItem,
  removeItems,
  onEditItem,
  isPlaying = false,
}) => {
  const [localVolume, setLocalVolume] = useState<number>(1);
  const [position, setPosition] = useState(0);
  const { updateAudioItemVolume } = useAudioItemControls();
  const { getFilePosition } = useSfxAudio();


  useEffect(() => {
    if (isAudioFile(item) || isAudioMacro(item)) {
      setLocalVolume(item.volume ?? 1);
    } else {
      setLocalVolume(1);
    }
  }, [item]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const newVolume = parseFloat(e.target.value);
      setLocalVolume(newVolume);
      updateAudioItemVolume(item, newVolume, parentCollection);
    },
    [item, parentCollection, updateAudioItemVolume]
  );

  // Helper function to format duration
  const formatDuration = (seconds?: number) => {
    if (seconds == undefined) return "";
    if (seconds === 0) return "0:00";
    const date = new Date(seconds * 1000);
    return date
      .toISOString()
      .slice(11, 19)
      .replace(/^00:/, "")
      .replace(/^0/, "");
  };

  // Add effect to update position for playing SFX items
  useEffect(() => {
    if (isPlaying && isSfxCollection(parentCollection)) {
      setPosition(0); // reset to prevent any intermediate values showing
      const interval = setInterval(() => {
        const pos = getFilePosition(item.id);
        setPosition(pos !== null ? pos : 0);
      }, 100); // Update 10 times per second
      
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isPlaying, parentCollection, item.id, getFilePosition]);

 

  return (
    <div className={styles.audioItemContent}>
      <div className={styles.audioItemHeader}>
        <div className={styles.playableItemTitle}>
          <h4 className={styles.audioItemName} title={item.name}>
            {/* <span className={`item-icon`}>
              {React.createElement(getItemIcon(item))}
            </span> */}
            {item.name}
          </h4>

          {(isAudioFile(item) || isAudioMacro(item)) &&
            item.duration !== undefined && (
              <span className={styles.audioItemInfo}>
                {formatDuration(item.duration)}
              </span>
            )}

          {isAudioCollection(item) && item.itemCount !== undefined && (
            <span className={styles.audioItemInfo}>
              {item.itemCount === 0 ? "empty" : `${item.itemCount} items`}
            </span>
          )}
        </div>

        {showActions && (
          <div className={styles.itemActions}>
            <ItemActions
              item={item}
              collectionId={parentCollection.id}
              selectedItems={parentCollection.items?.filter((i) =>
                selectedItemIds.includes(i.id)
              )}
              removeItems={removeItems}
              onEditClick={onEditItem}
              isSmall
            />
          </div>
        )}
      </div>

      <button
        className={styles.playButton}
        onClick={(e) => {
          e.stopPropagation();
          onPlayItem(item.id);
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <span className={styles.playIcon}>{isPlaying ? "◼" : "▶"}</span>
      </button>

      {(!isAudioCollection(item) || isAudioMacro(item)) && (
        <div className={styles.volumeSliderContainer}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localVolume}
            onClick={(e) => e.stopPropagation()}
            onChange={handleVolumeChange}
            className="volume-slider"
            aria-label="Volume"
          />
        </div>
      )}
    
      {isPlaying && isSfxCollection(parentCollection) && (
        <div className={styles.sfxProgressTrack}>
          <div 
            className={styles.sfxProgressIndicator} 
            style={{ 
              width: `${(position / (isAudioFile(item) && item.duration ? item.duration : 1)) * 100}%` 
            }}
          />
        </div>
      )}
    </div>
  );
};

export default PlayableItemContent;
