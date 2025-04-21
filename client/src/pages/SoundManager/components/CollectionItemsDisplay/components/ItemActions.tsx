import React from "react"; // Remove useState import
import { AudioItem, AudioItemActions } from "../types.js";
import { MdEdit } from "react-icons/md";
import "./ItemActions.css";

interface ItemActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  buttonClass: string;
  small: boolean;
}

const ActionButton: React.FC<ItemActionProps> = ({
  icon,
  label,
  onClick,
  buttonClass,
  small,
}) => {
  const sizeClass = small ? "small" : "";
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
  selectedItems?: AudioItem[];
  isSmall?: boolean;
  onEditClick?: (itemId: number) => void; 
}

const ItemActions: React.FC<ItemActionsProps> = ({
  item,
  selectedItems = [],
  useRemoveItems,
  isSmall = false,
  onEditClick, 
}) => {
  // Don't show actions for create buttons
  if (item.isCreateButton) return null;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEditClick) {
      onEditClick(item.id);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    if (!useRemoveItems) return;
    e.stopPropagation();

    // If the item is selected, remove all selected items
    // Otherwise, remove just the clicked item
    const itemsToRemove =
      selectedItems.length > 0 && selectedItems.some((si) => si.id == item.id)
        ? selectedItems
        : [item];

    useRemoveItems(itemsToRemove);
  };

  const containerClass = isSmall ? "item-actions" : "audio-item-controls";

  return (
    <div className={containerClass}>
      <ActionButton
        icon={<MdEdit />}
        label="Edit"
        onClick={handleEditClick}
        buttonClass="edit-button"
        small={isSmall}
      />
  
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
