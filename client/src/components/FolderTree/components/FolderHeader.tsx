import React from 'react';
import { Folder } from 'src/components/FolderTree/types.js';
import { getFolderIcon } from '../utils/icons.js';
import FileScanButton from './FileScanButton.js';

interface FolderHeaderProps {
  folder: Folder;
  isOpen: boolean;
  hasContents: boolean;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onScanComplete?: () => void;
}

const FolderHeader: React.FC<FolderHeaderProps> = ({
  folder,
  isSelected,
  isOpen,
  hasContents,
  onClick,
  onDragStart,
  onDragEnd,
  onScanComplete
}) => {
  return (
    <div 
      className={`folder-header ${isSelected ? 'selected' : ''}`} 
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-type={folder.type}
    >
      <span className={`folder-icon ${hasContents ? (isOpen ? 'open' : 'closed') : ''}`}>
        {getFolderIcon(folder.type, isOpen, hasContents)}
      </span>
      <span className="folder-name">{folder.name}</span>
      {folder.type === 'root' && (
        <FileScanButton onScanComplete={onScanComplete} />
      )}
    </div>
  );
};

export default FolderHeader;