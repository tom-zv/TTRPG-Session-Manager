import { useCallback, useMemo } from "react";
import { Folder, AudioFileUI } from "../types.js";
import { useSelection } from "../../../../../hooks/useSelection.js";

/**
 * Custom hook to manage selection logic for folder tree
 * Handles both file and folder selection with cross-clearing logic
 */
export function useFolderTreeSelection({
  flatAudioFiles,
  flatFolders
}: {
  flatAudioFiles: AudioFileUI[];
  flatFolders: Folder[];
}) {
  // Create file selection hook instance with circular reference to folder selection
  const fileSelection = useSelection<AudioFileUI>({
    getItemId: (file) => file.id,
    onSelectionChange: (selectedFiles) => {
      // When files are selected, clear folder selection
      if (
        selectedFiles.length > 0 &&
        folderSelection.selectedItems.length > 0
      ) {
        folderSelection.clearSelection();
      }
    },
  });

  // Create folder selection hook instance with circular reference to file selection
  const folderSelection = useSelection<Folder>({
    getItemId: (folder) => folder.id,
    onSelectionChange: (selectedFolders) => {
      // When folders are selected, clear file selection
      if (
        selectedFolders.length > 0 &&
        fileSelection.selectedItems.length > 0
      ) {
        fileSelection.clearSelection();
      }
    },
    // Custom single select handler that prevents folder selection unless in multi-select
    onSingleSelect: (_folder, currentSelection) => {
      // Don't allow folders to be selected in single-select mode
      return currentSelection;
    },
  });

  // Derived data as memoized values to prevent unnecessary recalculations
  const selectedFolderIds = useMemo(() => 
    folderSelection.selectedItems.map((folder) => folder.id),
    [folderSelection.selectedItems]
  );
  
  const selectedFileIds = useMemo(() => 
    fileSelection.selectedItems.map((file) => file.id),
    [fileSelection.selectedItems]
  );

  // Selection handlers using the useSelection hook
  const handleFolderSelect = useCallback(
    (
      folder: Folder,
      isMultiSelect: boolean = false,
      isShiftSelect: boolean = false
    ) => {
      // Only allow folder selection in multi-select mode
      if (!isMultiSelect) return;

      folderSelection.handleSelect(
        folder,
        flatFolders,
        isMultiSelect,
        isShiftSelect
      );
    },
    [flatFolders, folderSelection]
  );

  const handleFileSelect = useCallback(
    (
      file: AudioFileUI,
      isMultiSelect: boolean = false,
      isShiftSelect: boolean = false
    ) => {
      // Check if we're adding to existing selection
      if (
        (isMultiSelect || isShiftSelect) &&
        fileSelection.selectedItems.length > 0
      ) {
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
      const folderFiles = flatAudioFiles.filter(
        (f) => f.folderId === file.folderId
      );

      fileSelection.handleSelect(
        file,
        folderFiles,
        isMultiSelect,
        isShiftSelect
      );
    },
    [flatAudioFiles, fileSelection]
  );

  return {
    fileSelection,
    folderSelection,
    selectedFolderIds,
    selectedFileIds,
    handleFolderSelect,
    handleFileSelect
  };
}