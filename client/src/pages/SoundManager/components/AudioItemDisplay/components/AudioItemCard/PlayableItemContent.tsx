import React from 'react';
import { AudioFile } from '../../types.js';
import ItemActions from '../ItemActions.js';

interface PlayableItemContentProps {
  item: AudioFile;
  showActions: boolean;
  selectedItemIds: number[];
  onPlayItem: (itemId: number) => void;
  onEditItem?: (itemId: number, params: any) => void;
  onRemoveItems?: (itemIds: number[]) => void;
}

const PlayableItemContent: React.FC<PlayableItemContentProps> = ({
  item,
  showActions,
  selectedItemIds,
  onPlayItem,
  onEditItem,
  onRemoveItems
}) => {
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
          {item.duration && (
            <span className="audio-item-duration">{formatDuration(item.duration)}</span>
          )}
        </div>
        
        {showActions && (
          <div className="playable-item-actions" onClick={(e) => e.stopPropagation()}>
            <ItemActions
              item={item}
              selectedItemIds={selectedItemIds}
              onEditItem={onEditItem}
              onRemoveItems={onRemoveItems}
              isSmall
            />
          </div>
        )}
      </div>
      
      <button
        className="playable-item-play-button"
        onClick={(e) => {
          e.stopPropagation();
          onPlayItem(item.id);
        }}
        aria-label="Play"
      >
        <span className="play-icon">▶</span>
      </button>
      
      <div className="playable-item-volume">
        <div className="volume-bar" style={{ width: `${(item.volume || 1) * 100}%` }}></div>
      </div>
    </div>
  );
};

export default PlayableItemContent;