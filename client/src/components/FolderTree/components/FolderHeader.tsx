import React from 'react';
import { Folder } from 'shared/types/folder.js';
import { getFolderIcon } from '../utils/icons.js';

interface FolderHeaderProps {
  folder: Folder;
  isSelected: boolean;
  isOpen: boolean;
  hasContents: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const FolderHeader: React.FC<FolderHeaderProps> = ({
  folder,
  isSelected,
  isOpen,
  hasContents,
  onClick
}) => {
  return (
    <div 
      className={`folder-header ${isSelected ? 'selected' : ''}`} 
      onClick={onClick}
    >
      <span className={`folder-icon ${hasContents ? (isOpen ? 'open' : 'closed') : ''}`}>
        {getFolderIcon(folder.folder_type, isOpen, hasContents)}
      </span>
      <span className="folder-name">{folder.name}</span>
    </div>
  );
};

export default FolderHeader;