import React, { useCallback, useState, useEffect } from "react";
import {
  AudioItem,
  isAudioFile,
  isAudioCollection,
  AudioItemActions,
  isAudioMacro,
} from "../../types.js";
// import { getItemIcon } from "../../utils/getItemIcon.js";
import ItemActions from "../ItemActions.js";
import type { AudioCollection } from "../../index.js";
import { Audio } from "../../../../services/AudioService/AudioContext.js";

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
  const { updateAudioItemVolume } = Audio.useAudio();

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

  return (
    <div className="audio-item-content">
      <div className="audio-item-header">
        <div className="playable-item-title">
          <h4 className="audio-item-name" title={item.name}>
            {/* <span className={`item-icon`}>
              {React.createElement(getItemIcon(item))}
            </span> */}
            {item.name}
          </h4>

          {(isAudioFile(item) || isAudioMacro(item)) &&
            item.duration !== undefined && (
              <span className="audio-item-info">
                {formatDuration(item.duration)}
              </span>
            )}

          {isAudioCollection(item) && item.itemCount !== undefined && (
            <span className="audio-item-info">{item.itemCount} items</span>
          )}
        </div>

        {showActions && (
          <div className="item-actions">
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
        className={`playable-item-play-button ${isPlaying ? "playing" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onPlayItem(item.id);
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <span className="play-icon">{isPlaying ? "◼" : "▶"}</span>
      </button>

      {(!isAudioCollection(item) || isAudioMacro(item)) && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
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
