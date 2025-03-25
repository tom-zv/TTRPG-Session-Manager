import React, { useState, useEffect } from 'react';
import { Folder } from 'shared/types/folder.js';
import { AudioFile } from 'shared/types/audio.js';
import FolderDisplay from './FolderDisplay.js';
import { getAllFolders, getAllAudioFiles } from '../../../pages/SoundManager/api/AudioApi.js';
import { buildFolderTree } from '../utils/FolderTree.js';
import { useSelection } from '../../../hooks/useSelection.js';
import { useDragSource } from '../../../hooks/useDragSource.js';
import { getFilesFromFolders } from '../utils/DragUtils.js';
import '../FolderTree.css';

interface FolderTreeProps {
  showFilesInTree?: boolean;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  showFilesInTree = false,
}) => {
  // Internal state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Use selection hooks for folders and files
  const folderSelection = useSelection<Folder>({
    getItemId: folder => folder.id,
    onSelectionChange: (selectedFolders) => {
      // When folders are selected, clear file selection
      if (selectedFolders.length > 0 && fileSelection.selectedItems.length > 0) {
        fileSelection.clearSelection();
      }
    },
    // Custom single select handler that prevents folder selection unless in multi-select
    onSingleSelect: (_folder, currentSelection) => {
      // Don't allow folders to be selected in single-select mode
      return currentSelection;
    }
  });

  const fileSelection = useSelection<AudioFile>({
    getItemId: file => file.id,
    onSelectionChange: (selectedFiles) => {
      // When files are selected, clear folder selection
      if (selectedFiles.length > 0 && folderSelection.selectedItems.length > 0) {
        folderSelection.clearSelection();
      }
      
      // When a file is selected, highlight (but don't select) parent folder
      if (selectedFiles.length > 0 && folders.length > 0) {
        // Highlighting parent folder can be implemented separately if needed
      }
    }
  });

  // Derived data
  const selectedFolderIds = folderSelection.selectedItems.map(folder => folder.id);
  const selectedFileIds = fileSelection.selectedItems.map(file => file.id);

  // Drag source for folders
  const folderDragSource = useDragSource<AudioFile>({
    contentType: 'file',
    mode: 'file-transfer',
    getItemId: file => file.id,
    getItemsForDrag: (selectedIds) => {
      // When dragging folders, get all audio files from those folders
      return getFilesFromFolders(selectedIds, folders, audioFiles);
    }
  });
  
  // Drag source for individual files
  const fileDragSource = useDragSource<AudioFile>({
    contentType: 'file',
    mode: 'file-transfer',
    getItemId: file => file.id,
    getItemsForDrag: (selectedIds) => {
      // Get the selected audio files
      return audioFiles.filter(file => selectedIds.includes(file.id));
    },
    getItemName: (file) => file.name || `Audio #${file.id}`
  });

  // Helper function to flatten folder tree
  const flattenFolders = (folders: Folder[]): Folder[] => {
    let result: Folder[] = [];

    for (const folder of folders) {
      result.push(folder);
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children));
      }
    }

    return result;
  };

  // Load folders and audio files
  useEffect(() => {
    loadData();
  }, []);

  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load folders
      const allFolders = await getAllFolders();
      const folderTree = buildFolderTree(allFolders);
      setFolders(folderTree);

      // Load audio files
      const files = await getAllAudioFiles();
      setAudioFiles(files);
    } catch (error) {
      console.error("Error loading library data:", error);
      setError("Failed to load audio library. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Selection handlers using the useSelection hook
  const handleFolderSelect = (folder: Folder, isMultiSelect: boolean = false, isShiftSelect: boolean = false) => {
    // Only allow folder selection in multi-select mode
    if (!isMultiSelect) return;
    
    folderSelection.handleSelect(folder, flattenFolders(folders), isMultiSelect, isShiftSelect);
  };

  const handleFileSelect = (file: AudioFile, isMultiSelect: boolean = false, isShiftSelect: boolean = false) => {
    // Check if we're adding to existing selection
    if ((isMultiSelect || isShiftSelect) && fileSelection.selectedItems.length > 0) {
      // Get the type of the first selected file
      const firstSelectedType = fileSelection.selectedItems[0].audioType;
      
      // Only allow selection if it's the same type
      if (file.audioType !== firstSelectedType) {
        // Don't allow selection of different types
        alert("Cannot select files of different types."); // convert to toast
        return;
      }
    }
    
    // For range file selection, we'll consider only files in the same folder
    const folderFiles = audioFiles.filter(f => 
      f.folderId === file.folderId
    );
    
    fileSelection.handleSelect(file, folderFiles, isMultiSelect, isShiftSelect);
  };

  // Drag handlers
  const handleFolderDragStart = (e: React.DragEvent, folder: Folder) => {
    folderDragSource.handleDragStart(e, { id: folder.id } as AudioFile, [folder.id]);
  };
  
  const handleFileDragStart = (e: React.DragEvent, file: AudioFile) => {
    // If the file isn't in the selection, start a new drag with just this file
    if (!selectedFileIds.includes(file.id)) {
      fileDragSource.handleDragStart(e, file, [file.id]);
    } else {
      // Otherwise, drag all selected files
      fileDragSource.handleDragStart(e, file, selectedFileIds);
    }
  };

  if (loading) return (
    <div className="folder-tree-container">
      <div className="loading-indicator">Loading audio library...</div>
    </div>
  );

  if (error) return (
    <div className="folder-tree-container">
      <div className="error-message">{error}</div>
      <button onClick={loadData}>Retry</button>
    </div>
  );

  return (
    <div className="folder-tree-container">
      <FolderDisplay
        folders={folders}
        onFolderSelect={handleFolderSelect}
        onFileSelect={handleFileSelect}
        selectedFolderIds={selectedFolderIds}
        selectedFileIds={selectedFileIds}
        audioFiles={audioFiles}
        showFilesInTree={showFilesInTree}
        onFolderDragStart={handleFolderDragStart}
        onFolderDragEnd={folderDragSource.handleDragEnd}
        onFileDragStart={handleFileDragStart}
        onFileDragEnd={fileDragSource.handleDragEnd}
      />
    </div>
  );
};

export default FolderTree;