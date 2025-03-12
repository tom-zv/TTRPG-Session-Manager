import React from 'react';
import { Folder } from 'shared/types/folder.js';
import { AudioFile } from 'shared/types/audio.js';
import FolderDisplay from './FolderDisplay.js';
import { useFolderData } from '../hooks/useFolderData.js';
import '../FolderTree.css';

interface FolderTreeProps {
  onFolderSelect?: (folder: Folder, isMultiSelect: boolean) => void;
  onFileSelect?: (file: AudioFile, isMultiSelect: boolean) => void;
  selectedFolderIds?: number[];
  selectedFileIds?: number[];
  audioFiles?: AudioFile[];
  showFilesInTree?: boolean;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  onFolderSelect, 
  onFileSelect,
  selectedFolderIds = [],
  selectedFileIds = [],
  audioFiles = [],
  showFilesInTree = false
}) => {
  const { folders, loading, error, refreshFolders } = useFolderData();
  
  if (loading) return (
    <div className="folder-tree-container">
      <div className="loading-indicator">Loading folders...</div>
    </div>
  );
  
  if (error) return (
    <div className="folder-tree-container">
      <div className="error-message">{error}</div>
      <button onClick={refreshFolders}>Retry</button>
    </div>
  );
  
  return (
    <div className="folder-tree-container">
      <FolderDisplay 
        folders={folders} 
        onFolderSelect={onFolderSelect}
        onFileSelect={onFileSelect}
        selectedFolderIds={selectedFolderIds}
        selectedFileIds={selectedFileIds}
        audioFiles={audioFiles}
        showFilesInTree={showFilesInTree}
      />
    </div>
  );
};

export default FolderTree;