import React, { useState, useEffect } from "react";
import { Folder, AudioFile } from "src/pages/SoundManager/components/FolderTree/types.js";
import { getAllFolders} from "src/pages/SoundManager/api/folderApi.js";
import { getAllAudioFiles } from "src/pages/SoundManager/api/fileApi.js";
import { buildFolderTree } from "../utils/FolderTree.js";
import { getNestedFiles } from "../utils/DragUtils.js";
import { useSelection } from "../../../../../hooks/useSelection.js";
import { useDragSource } from "../../../../../hooks/useDragSource.js";
import FolderDisplay from "./FolderDisplay.js";
import "../FolderTree.css";



const FolderTree: React.FC = ({
}) => {
  // Internal state
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [folderTreeKey, setFolderTreeKey] = useState<number>(0);

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
  const folderDragSource = useDragSource<Folder>({
    contentType: 'folder',
    mode: 'file-transfer',
    getItemId: file => file.id,
  });
  
  // Drag source for individual files
  const fileDragSource = useDragSource<AudioFile>({
    contentType: 'file',
    mode: 'file-transfer',
    getItemId: file => file.id,
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
  }, [folderTreeKey]); // Re-run when key changes

  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load audio files
      const files = await getAllAudioFiles();
      setAudioFiles(files);

      // Load folders
      const allFolders = await getAllFolders();
      const folderTree = buildFolderTree(allFolders, files);
      setFolders(folderTree);

      
    } catch (error) {
      console.error("Error loading library data:", error);
      setError("Failed to load audio library. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Handle scan completion
  const handleScanComplete = () => {
    // Increment the key to trigger a re-render with fresh data
    setFolderTreeKey(prevKey => prevKey + 1);
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
    console.log("Folder drag start:", folder);
    folder.files = getNestedFiles(folder, folders); // Populate with nested files
    console.log("Nested files:", folder.files);
    folderDragSource.handleDragStart(e, [folder]);
  };
  
  const handleFileDragStart = (e: React.DragEvent, file: AudioFile) => {
    // If the file isn't in the selection, start a new drag with just this file
    console.log("File drag start:", file);
    if (!selectedFileIds.includes(file.id)) {
      fileDragSource.handleDragStart(e, [file]);
    } else {
      // Otherwise, drag all selected files
      fileDragSource.handleDragStart(e, fileSelection.selectedItems);
    }
  };

  // Handle folder addition (optimistic or from server)
  const handleFolderCreated = (newFolder: Folder) => {
    setFolders(prevFolders => {
      // Get a flattened array of all folders
      const flat = flattenFolders(prevFolders);
      
      if (newFolder.id > 0) {
        // If this is a real folder from server, find and replace any temporary version
        const updatedFolders = flat.map(folder => {
          // Match by name and parentId since temp folder has negative ID
          if (folder.id < 0 && folder.name === newFolder.name && folder.parentId === newFolder.parentId) {
            return newFolder; // Replace with server folder
          }
          return folder;
        });
        
        return buildFolderTree(updatedFolders, audioFiles);
      } else {
        // For optimistic updates, just add the new folder
        return buildFolderTree([...flat, newFolder], audioFiles);
      }
    });
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
        onFolderDragStart={handleFolderDragStart}
        onFolderDragEnd={folderDragSource.handleDragEnd}
        onFileDragStart={handleFileDragStart}
        onFileDragEnd={fileDragSource.handleDragEnd}
        onScanComplete={handleScanComplete}
        onFolderCreated={handleFolderCreated}
      />
    </div>
  );
};

export default FolderTree;