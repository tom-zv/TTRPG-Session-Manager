import React from 'react';
import { AudioItem } from '../types.js';
import './ItemActions.css';

interface ItemActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  buttonClass: string;
  small: boolean;
}

const ActionButton: React.FC<ItemActionProps> = ({ icon, label, onClick, buttonClass, small }) => {
  const sizeClass = small ? 'small' : '';
  return (
    <button
      className={`${buttonClass} ${sizeClass}`}
      onClick={onClick}
      aria-label={label}
    >
      <span>{icon}</span>
    </button>
  );
};

interface ItemActionsProps {
  item: AudioItem;
  selectedItemIds?: number[];
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number, params: any) => void;
  onRemoveItems?: (itemIds: number[]) => void;
  isSmall?: boolean;
}

const ItemActions: React.FC<ItemActionsProps> = ({
  item,
  selectedItemIds = [],
  onPlayItem,
  onEditItem,
  onRemoveItems,
  isSmall = false
}) => {
  // Don't show actions for create buttons
  if (item.isCreateButton) return null;
  
  const handlePlayClick = (e: React.MouseEvent) => {
    if (onPlayItem) {
      e.stopPropagation();
      onPlayItem(item.id);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    if (onEditItem) {
      e.stopPropagation();
      onEditItem(item.id, {}); // Pass needed params here
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    if (!onRemoveItems) return;
    e.stopPropagation();

    const idsToRemove = selectedItemIds.length > 0
      ? selectedItemIds
      : [item.id];

    onRemoveItems(idsToRemove);
  };

  const containerClass = isSmall ? "item-actions" : "audio-item-controls";

  return (
    <div className={containerClass}>
      {onPlayItem && (
        <ActionButton 
          icon="▶" 
          label="Play"
          onClick={handlePlayClick}
          buttonClass="play-button"
          small={isSmall}
        />
      )}
      
      {onEditItem && (
        <ActionButton 
          icon="✏️" 
          label="Edit"
          onClick={handleEditClick}
          buttonClass="edit-button"
          small={isSmall}
        />
      )}
      
      {onRemoveItems && (
        <ActionButton 
          icon="×" 
          label="Remove"
          onClick={handleRemoveClick}
          buttonClass="delete-button" 
          small={isSmall}
        />
      )}
    </div>
  );
};

export default ItemActions;