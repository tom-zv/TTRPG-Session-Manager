import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Position calculation function
  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.right - 160 + window.scrollX, // 160px is dropdown width
      });
    }
  };

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
    if (!isOpen) {
      updateDropdownPosition();
    }
    setIsOpen(!isOpen);
  };

  // Update position on scroll or resize
  useEffect(() => {
    if (isOpen) {
      window.addEventListener("scroll", updateDropdownPosition);
      window.addEventListener("resize", updateDropdownPosition);
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      window.removeEventListener("scroll", updateDropdownPosition);
      window.removeEventListener("resize", updateDropdownPosition);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
    }
  };
  
  // Don't show actions for create buttons
  if (item.isCreateButton) return null;
  
  return (
    <div className="item-actions">
      <button
        ref={buttonRef}
        className={`dropdown-toggle ${isSmall ? "dropdown-toggle--small" : ""} ${isOpen ? 'active' : ''}`}
        onClick={toggleDropdown}
        aria-label="Open actions menu"
        aria-expanded={isOpen}
      >
        <MdMoreVert />
      </button>

      {isOpen && createPortal(
        <div 
          className="dropdown-menu"
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
          }}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default ItemActions;
