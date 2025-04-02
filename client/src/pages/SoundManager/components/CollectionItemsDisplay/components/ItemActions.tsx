import React from 'react';
import { AudioItem, AudioItemActions } from '../types.js';
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

interface ItemActionsProps extends AudioItemActions {
  collectionId: number;
  item: AudioItem;
  selectedItemIds?: number[];
  isSmall?: boolean;
}

const ItemActions: React.FC<ItemActionsProps> = ({
  item,
  selectedItemIds = [],
  useRemoveItems,
  isSmall = false
}) => {
  // Don't show actions for create buttons
  if (item.isCreateButton) return null;
  
  // const handleEditClick = (e: React.MouseEvent) => {
  //   if (useEditItem) {
  //     e.stopPropagation();
  //     //useEditItem(item.id, {}); // Pass needed params here
  //   }
  // };

  const handleRemoveClick = (e: React.MouseEvent) => {
    if (!useRemoveItems) return;
    e.stopPropagation();

    const idsToRemove = selectedItemIds.length > 0 && selectedItemIds.some(id => id == item.id)
      ? selectedItemIds
      : [item.id];

    useRemoveItems(idsToRemove);
  };

  const containerClass = isSmall ? "item-actions" : "audio-item-controls";

  return (
    <div className={containerClass}>
      
      {/* {useEditItem && (
        <ActionButton 
          icon="⚙" 
          label="Edit"
          onClick={handleEditClick}
          buttonClass="edit-button"
          small={isSmall}
        />
      )} */}
      
      {useRemoveItems && (
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