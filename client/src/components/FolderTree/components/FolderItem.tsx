import React, { useState } from 'react';
import { Folder } from 'shared/types/folder.js';
import { AudioFile } from 'shared/types/audio.js';
import FolderHeader from './FolderHeader.js';
import FileItem from './FileItem.js';

interface FolderItemProps {
  folder: Folder;
  onFolderSelect?: (folder: Folder, isMultiSelect: boolean) => void;
  onFileSelect?: (file: AudioFile, isMultiSelect: boolean) => void;
  isSelected: boolean;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  audioFiles?: AudioFile[];
  showFilesInTree?: boolean;
  level: number;
}

const FolderItem: React.FC<FolderItemProps> = ({ 
  folder, 
  onFolderSelect, 
  onFileSelect,
  isSelected,
  selectedFolderIds = [],
  selectedFileIds = [],
  audioFiles = [],
  showFilesInTree = false,
  level 
}) => {
  const [isOpen, setIsOpen] = useState(level === 0); // Auto-expand root level
  
  const hasChildren = folder.children && folder.children.length > 0;
  const folderFiles = showFilesInTree 
    ? audioFiles.filter(file => file.folder_id === folder.folder_id)
    : [];
  const hasFiles = folderFiles.length > 0;
  const hasContents = hasChildren || hasFiles;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Control or Command key for multi-selection
    const isMultiSelect = e.ctrlKey || e.metaKey;
    
    if (hasContents) {
      // Only toggle folder open/close state on regular click (not multi-select)
      if (!isMultiSelect) {
        setIsOpen(!isOpen);
      }
    }
    
    if (onFolderSelect) {
      onFolderSelect(folder, isMultiSelect);
    }
  };
  
  const handleFileClick = (e: React.MouseEvent, file: AudioFile) => {
    e.stopPropagation();
    
    const isMultiSelect = e.ctrlKey || e.metaKey;
    
    if (onFileSelect) {
      onFileSelect(file, isMultiSelect);
    }
  };
  
  return (
    <li 
      className="folder-item" 
      data-folder-id={folder.folder_id}
      data-type={folder.folder_type}
      data-draggable="true"
    >
      <FolderHeader
        folder={folder}
        isSelected={isSelected}
        isOpen={isOpen}
        hasContents={hasContents}
        onClick={handleClick}
      />
      
      {isOpen && (
        <ul className="folder-children">
          {/* Render subfolders first */}
          {hasChildren && folder.children && folder.children.map(childFolder => (
            <FolderItem 
              key={childFolder.folder_id} 
              folder={childFolder} 
              onFolderSelect={onFolderSelect}
              onFileSelect={onFileSelect}
              isSelected={selectedFolderIds?.includes(childFolder.folder_id) || false}
              selectedFolderIds={selectedFolderIds}
              selectedFileIds={selectedFileIds}
              audioFiles={audioFiles}
              showFilesInTree={showFilesInTree}
              level={level + 1}
            />
          ))}
          
          {/* Add separator if we have both children and files */}
          {hasChildren && hasFiles && showFilesInTree && (
            <li className="folder-separator"></li>
          )}
          
          {/* Render files in this folder */}
          {hasFiles && showFilesInTree && folderFiles.map(file => (
            <FileItem
              key={`file-${file.audio_file_id}`}
              file={file}
              isSelected={selectedFileIds.includes(file.audio_file_id)}
              selectedFileIds={selectedFileIds}
              audioFiles={audioFiles}
              onFileClick={handleFileClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export default FolderItem;