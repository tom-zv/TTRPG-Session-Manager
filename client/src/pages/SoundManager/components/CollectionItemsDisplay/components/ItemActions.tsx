import React, { useEffect, useRef, useState } from "react";
import { AudioItem, AudioItemActions } from "../types.js";
import { MdEdit, MdClose, MdMoreVert } from "react-icons/md";
import "./ItemActions.css";

interface DropdownItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  itemType: "edit" | "delete";
}

const DropdownItem: React.FC<DropdownItemProps> = ({
  icon,
  label,
  onClick,
  itemType,
}) => {
  return (
    <button
      type="button"
      className={`dropdown-item dropdown-item--${itemType}`}
      onClick={onClick}
      aria-label={label}
    >
      <span>{icon}</span>
      <span>{label}</span>
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
  removeItems,
  isSmall = false,
  onEditClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (onEditClick) {
      onEditClick(item.id);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    if (!removeItems) return;
    e.stopPropagation();
    setIsOpen(false);

    // If the item is selected, remove all selected items
    // Otherwise, remove just the clicked item
    const itemsToRemove =
      selectedItems.length > 0 && selectedItems.some((si) => si.id == item.id)
        ? selectedItems
        : [item];

    removeItems(itemsToRemove);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Don't show actions for create buttons
  if (item.isCreateButton) return null;
  
  return (
    <div className="item-actions" ref={dropdownRef}>
      <button
        className={`dropdown-toggle ${isSmall ? "dropdown-toggle--small" : ""} ${isOpen ? 'active' : ''}`}
        onClick={toggleDropdown}
        aria-label="Open actions menu"
        aria-expanded={isOpen}
      >
        <MdMoreVert />
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <DropdownItem
            icon={<MdEdit />}
            label="Edit"
            onClick={handleEditClick}
            itemType="edit"
          />

          {removeItems && (
            <DropdownItem
              icon={<MdClose />}
              label="Remove"
              onClick={handleRemoveClick}
              itemType="delete"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ItemActions;
