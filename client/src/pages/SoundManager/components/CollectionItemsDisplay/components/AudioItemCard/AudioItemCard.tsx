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
  dragItemProps: React.HTMLAttributes<HTMLDivElement>;
  onSelect: (e: React.MouseEvent | React.KeyboardEvent, itemId: number) => void;
  onPlayItem: (itemId: number) => void;
  onEditItem?: (itemId: number) => void;
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
  onEditItem,
  removeItems,
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect(e, item.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
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
          removeItems={removeItems}
          isPlaying={isPlaying}
          onEditItem={onEditItem} 
        />
      ) : (
        <StandardItemContent
          item={item}
          parentCollection={collection}
          showActions={showActions}
          selectedItemIds={selectedItemIds}
          removeItems={removeItems}
          onEditItem={onEditItem} 
        />
      )}
    </div>
  );
};

export default AudioItemCard;