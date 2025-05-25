import React, { createContext, useContext, ReactNode } from "react";
import { Folder, AudioFile } from "../types.js";
import { useFolderTreeData } from "../hooks/useFolderTreeData.js";
import { useFolderTreeSelection } from "../hooks/useFolderTreeSelection.js";
import { useFolderTreeDragDrop } from "../hooks/useFolderTreeDragDrop.js";

// Define the shape of our context value
interface FolderTreeContextValue {
  // Data and loading state
  flatAudioFiles: AudioFile[];
  flatFolders: Folder[];
  folderTree: Folder[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  
  // Selection state and handlers
  selectedFolderIds: number[];
  selectedFileIds: number[];
  handleFolderSelect: (folder: Folder, isMultiSelect?: boolean, isShiftSelect?: boolean) => void;
  handleFileSelect: (file: AudioFile, isMultiSelect?: boolean, isShiftSelect?: boolean) => void;
  fileSelection: {
    selectedItems: AudioFile[];
    clearSelection: () => void;
  };
  
  // Drag and drop handlers
  handleFolderDragStart: (e: React.DragEvent, folder: Folder) => void;
  handleFolderDragEnd: (e: React.DragEvent) => void;
  handleFileDragStart: (e: React.DragEvent, file: AudioFile) => void;
  handleFileDragEnd: (e: React.DragEvent) => void;
  
  // Folder management
  handleFolderCreated: (folder: Folder) => void;
}

const FolderTreeContext = createContext<FolderTreeContextValue | undefined>(undefined);

export const FolderTreeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    flatAudioFiles,
    flatFolders,
    folderTree,
    loading,
    error,
    reload,
    handleFolderCreated
  } = useFolderTreeData();


  const {
    selectedFolderIds,
    selectedFileIds,
    handleFolderSelect,
    handleFileSelect,
    fileSelection
  } = useFolderTreeSelection({
    flatAudioFiles,
    flatFolders
  });

  const {
    handleFolderDragStart,
    handleFolderDragEnd,
    handleFileDragStart,
    handleFileDragEnd
  } = useFolderTreeDragDrop({
    flatFolders,
    selectedFileIds,
    selectedItems: fileSelection.selectedItems
  });

  // Combine all values for the context
  const contextValue: FolderTreeContextValue = {
    flatAudioFiles,
    flatFolders,
    folderTree,
    loading,
    error,
    reload,
    selectedFolderIds,
    selectedFileIds,
    handleFolderSelect,
    handleFileSelect,
    fileSelection,
    handleFolderDragStart,
    handleFolderDragEnd,
    handleFileDragStart,
    handleFileDragEnd,
    handleFolderCreated
  };

  return (
    <FolderTreeContext.Provider value={contextValue}>
      {children}
    </FolderTreeContext.Provider>
  );
};

// Custom hook for consuming the context
export const useFolderTree = (): FolderTreeContextValue => {
  const context = useContext(FolderTreeContext);
  if (context === undefined) {
    throw new Error("useFolderTree must be used within a FolderTreeProvider");
  }
  return context;
};