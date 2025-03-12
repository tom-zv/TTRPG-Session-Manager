import React from 'react';
import { Folder } from 'shared/types/folder.js';
import { AudioFile } from 'shared/types/audio.js';
import FolderItem from './FolderItem.js';

interface FolderDisplayProps {
  folders: Folder[];
  onFolderSelect?: (folder: Folder, isMultiSelect: boolean) => void;
  onFileSelect?: (file: AudioFile, isMultiSelect: boolean) => void;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  audioFiles?: AudioFile[];
  showFilesInTree?: boolean;
  level?: number;
}

const FolderDisplay: React.FC<FolderDisplayProps> = ({ 
  folders, 
  onFolderSelect, 
  onFileSelect,
  selectedFolderIds,
  selectedFileIds,
  audioFiles = [],
  showFilesInTree = false,
  level = 0 
}) => {
  return (
    <ul className="folder-tree" style={{ paddingLeft: level > 0 ? '0' : '0' }}>
      {folders.map(folder => (
        <FolderItem 
          key={folder.folder_id} 
          folder={folder} 
          onFolderSelect={onFolderSelect}
          onFileSelect={onFileSelect}
          isSelected={selectedFolderIds?.includes(folder.folder_id) || false}
          selectedFolderIds={selectedFolderIds}
          selectedFileIds={selectedFileIds}
          audioFiles={audioFiles}
          showFilesInTree={showFilesInTree}
          level={level}
        />
      ))}
    </ul>
  );
};

export default FolderDisplay;