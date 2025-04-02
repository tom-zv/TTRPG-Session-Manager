import React from 'react';
import { AudioItem, AudioItemActions } from '../../types.js';
import PlayableItemContent from './PlayableItemContent.js';
import StandardItemContent from './StandardItemContent.js';
import './AudioItemCard.css';
import type { AudioCollection } from '../../index.js';

interface AudioItemCardProps extends AudioItemActions {
  item: AudioItem;
  collection: AudioCollection;
  isSelected: boolean;
  isDropTarget: boolean;
  isPlaying?: boolean;
  isAmbienceActive?: boolean;
  showActions: boolean;
  selectedItemIds: number[];
  dragItemProps: any;
  onSelect: (e: React.MouseEvent, itemId: number) => void;
  onPlayItem: (itemId: number) => void;
}

const AudioItemCard: React.FC<AudioItemCardProps> = ({
  item,
  collection,
  isSelected,
  isDropTarget,
  isPlaying = false,
  isAmbienceActive = false,
  showActions,
  selectedItemIds,
  dragItemProps,
  onSelect,
  onPlayItem,
  useRemoveItems,
  useEditItem,
}) => {
  const isPlayable = !item.isCreateButton && 
    item.type !== 'pack' && item.type !== 'sfx';

  // Extract drag className and props more cleanly
  const { className: dragClassName, ...restDragProps } = dragItemProps || {};
  
  // Group related classes for better organization
  const cardClasses = [
    'audio-item-card',
    // Item type
    item.type || '',
    // Special card types
    item.isCreateButton ? 'create-collection-card' : '',
    // Item capabilities
    isPlayable ? 'playable-item' : '',
    // Card states
    isSelected ? 'selected' : '',
    isDropTarget ? 'card-drop-target' : '',
    isPlaying ? 'playing' : '',
    isAmbienceActive ? 'ambience-active' : '',
    // Drag classes
    dragClassName || ''
  ]
    .filter(Boolean) // Remove empty strings
    .join(' ');

  return (
    <div
      className={cardClasses}
      onClick={(e) => onSelect(e, item.id)}
      {...restDragProps}
    >
      {item.isCreateButton ? (
        <div className="create-collection-content">
          <div className="create-collection-icon">+</div>
          <span className="create-collection-text">{item.name}</span>
        </div>
      ) : isPlayable ? (
        <PlayableItemContent
          item={item}
          parentCollection={collection}
          showActions={showActions}
          selectedItemIds={selectedItemIds}
          onPlayItem={onPlayItem}
          useRemoveItems={useRemoveItems}
          useEditItem={useEditItem}
          isPlaying={isPlaying}
        />
      ) : (
        <StandardItemContent
          item={item}
          collectionId={collection.id}
          showActions={showActions}
          selectedItemIds={selectedItemIds}
          useRemoveItems={useRemoveItems}
          useEditItem={useEditItem}
        />
      )}
    </div>
  );
};

export default AudioItemCard;