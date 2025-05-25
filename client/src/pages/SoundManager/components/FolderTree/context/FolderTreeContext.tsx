import React, { createContext, useContext, ReactNode } from "react";
import { Folder, AudioFileUI } from "../types.js";
import { useFolderTreeData } from "../hooks/useFolderTreeData.js";
import { useFolderTreeSelection } from "../hooks/useFolderTreeSelection.js";
import { useFolderTreeDragDrop } from "../hooks/useFolderTreeDragDrop.js";
import { NestedProgressMap } from "../hooks/useFolderTreeData.js";

interface FolderTreeContextValue {
  // Data and loading state
  flatAudioFiles: AudioFileUI[];
  flatFolders: Folder[];
  folderTree: Folder[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;

  // Selection state and handlers
  selectedFolderIds: number[];
  selectedFileIds: number[];
  handleFolderSelect: (
    folder: Folder,
    isMultiSelect?: boolean,
    isShiftSelect?: boolean
  ) => void;
  handleFileSelect: (
    file: AudioFileUI,
    isMultiSelect?: boolean,
    isShiftSelect?: boolean
  ) => void;
  fileSelection: {
    selectedItems: AudioFileUI[];
    clearSelection: () => void;
  };

  // Drag and drop handlers
  handleFolderDragStart: (e: React.DragEvent, folder: Folder) => void;
  handleFolderDragEnd: (e: React.DragEvent) => void;
  handleFileDragStart: (e: React.DragEvent, file: AudioFileUI) => void;
  handleFileDragEnd: (e: React.DragEvent) => void;

  // Folder management
  handleFolderCreated: (folder: Folder) => void;

  // File management
  handleFileCreated: (file: AudioFileUI) => void;
  initializeDownloadProgress: (jobId: string, fileId: number) => void;
  handleFileDownloadError: ( jobId: string, folderId: number, error: string) => void;
  dismissDownloadError: (jobId: string, folderId: number) => void;
  folderDownloadProgress: NestedProgressMap
}

const FolderTreeContext = createContext<FolderTreeContextValue | undefined>(undefined);

export const FolderTreeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    flatAudioFiles,
    flatFolders,
    folderTree,
    folderDownloadProgress,
    loading,
    error,
    reload,
    handleFolderCreated,
    handleFileCreated,
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadError
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
    folderDownloadProgress,
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
    handleFolderCreated,
    handleFileCreated,
    initializeDownloadProgress,
    handleFileDownloadError,
    dismissDownloadError
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