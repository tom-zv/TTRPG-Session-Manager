import React from 'react';
import { AudioItem, AudioFile } from '../../types.js';
import PlayableItemContent from './PlayableItemContent.js';
import StandardItemContent from './StandardItemContent.js';
import './AudioItemCard.css';

interface AudioItemCardProps {
  item: AudioItem;
  isSelected: boolean;
  isDropTarget: boolean;
  showActions: boolean;
  showPlayButton: boolean;
  selectedItemIds: number[];
  dragItemProps: any;
  onSelect: (e: React.MouseEvent, itemId: number) => void;
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number, params: any) => void;
  onRemoveItems?: (itemIds: number[]) => void;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}

const AudioItemCard: React.FC<AudioItemCardProps> = ({
  item,
  isSelected,
  isDropTarget,
  showActions,
  showPlayButton,
  selectedItemIds,
  dragItemProps,
  onSelect,
  onPlayItem,
  onEditItem,
  onRemoveItems,
  renderSpecialItem,
}) => {
  // Determine if this item should use the playable layout
  const isPlayable = !!onPlayItem && showPlayButton && !item.isCreateButton && 
    (item.type === 'file' || item.type === 'macro');
  
  // Combine classes from drag props with our own classes
  const { className: dragClassName, ...restDragProps } = dragItemProps || {};
  const combinedClassName = `
    audio-item-card 
    ${item.type || ''} 
    ${item.isCreateButton ? 'create-collection-card' : ''} 
    ${isSelected ? 'selected' : ''} 
    ${isDropTarget ? 'card-drop-target' : ''} 
    ${isPlayable ? 'playable-item' : ''} 
    ${dragClassName || ''}
  `.trim().replace(/\s+/g, ' ');

  return (
    <div
      className={combinedClassName}
      onClick={(e) => onSelect(e, item.id)}
      {...restDragProps}
    >
      {item.isCreateButton && renderSpecialItem ? (
        renderSpecialItem(item)
      ) : isPlayable ? (
        <PlayableItemContent
          item={item as AudioFile}
          showActions={showActions}
          selectedItemIds={selectedItemIds}
          onPlayItem={onPlayItem!}
          onEditItem={onEditItem}
          onRemoveItems={onRemoveItems}
        />
      ) : (
        <StandardItemContent
          item={item}
          showActions={showActions}
          selectedItemIds={selectedItemIds}
          onPlayItem={showPlayButton ? onPlayItem : undefined}
          onEditItem={onEditItem}
          onRemoveItems={onRemoveItems}
        />
      )}
    </div>
  );
};

export default AudioItemCard;