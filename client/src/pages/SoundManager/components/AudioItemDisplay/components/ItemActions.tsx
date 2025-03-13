import React from 'react';
import { AudioItem, AudioItemActions } from '../types.js';

interface ItemActionsProps extends AudioItemActions {
  item: AudioItem;
  isSmall?: boolean;
}

export const ItemActions: React.FC<ItemActionsProps> = ({
  item,
  onEditItem,
  onRemoveItem,
  isSmall = false
}) => {
  // Event handlers with stopPropagation

  const handleEditClick = (e: React.MouseEvent) => {
    if (onEditItem) {
      e.stopPropagation();
      onEditItem(item.id);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    if (onRemoveItem) {
      e.stopPropagation();
      onRemoveItem(item.id);
    }
  };

  const buttonClass = isSmall ? 'small' : '';

  return (
    <div className={isSmall ? "item-actions" : "audio-item-controls"}>
      
      {onEditItem && !item.isCreateButton && (
        <button
          className={`edit-button ${buttonClass}`}
          onClick={handleEditClick}
          title="Edit"
        >
          ✏️
        </button>
      )}
      
      {onRemoveItem && !item.isCreateButton && (
        <button
          className={`delete-button ${buttonClass}`}
          onClick={handleRemoveClick}
          title="Remove"
        >
          X
        </button>
      )}
    </div>
  );
};

export const PlayItem: React.FC<ItemActionsProps> = ({ item, onPlayItem }) => {
  const handlePlayClick = (e: React.MouseEvent) => {
    if (onPlayItem) {
      e.stopPropagation();
      onPlayItem(item.id);
    }
  };

  return (
    <div className={"item-actions"}>
      <button
        className="play-button"
        onClick={handlePlayClick}
        title="Play"
      >
        &#9658;
      </button>
    </div>
  );
}

export default ItemActions;