import React from 'react';
import {
  AudioItem,
  AudioItemActions,
  isPlayableItem,
} from '../../../types.js';
import PlayableItemContent from './PlayableItemContent.js';
import StandardItemContent from './StandardItemContent.js';
import styles from './AudioItemCard.module.css';
import type { AudioCollection } from '../../../types.js';
import type { AudioItemPlayState } from 'src/pages/SoundManager/services/AudioService/AudioContext.js';

interface AudioItemCardProps extends AudioItemActions {
  item: AudioItem;
  collection: AudioCollection;
  isSelected: boolean;
  isDropTarget: boolean;
  playState?: AudioItemPlayState;
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
  playState = 'off',
  showActions,
  selectedItemIds,
  dragItemProps,
  onSelect,
  onPlayItem,
  onEditItem,
  removeItems,
}) => {
  const isPlayable = isPlayableItem(item);
  const cardKind = getItemKind(item);
  const isPlaying = playState === 'playing';
  const isActive = playState === 'active';

  // Separate drag className from other drag props
  const { className: dragClassName, ...restDragProps } = dragItemProps || {};

  function getItemKind(item: AudioItem){
  if (item.isCreateButton) {
    return "create";
  }

  if (item.type === "collection") {
    return "collection";
  }

  return "file";
}
  // Card class list
  const cardClasses = [
    styles.audioItemCard,
    item.isCreateButton ? styles.createCollectionCard : '',
    isSelected ? styles.selected : '',
    isDropTarget ? styles.cardDropTarget : '',
    isPlaying ? styles.playing : '',
    isActive ? styles.active : '',
    dragClassName || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClasses}
      data-type={item.audioType}
      data-card-kind={cardKind}

      data-item-type={item.type}
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
        <div className={styles.createCollectionContent}>
          <div className={styles.createCollectionIcon}>+</div>
          <span className={styles.createCollectionText}>{item.name}</span>
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