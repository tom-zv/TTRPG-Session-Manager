import { useCallback } from "react";
import { Folder, AudioFileUI } from "../types.js";
import { useDragSource } from "../../../../../hooks/useDragSource.js";
import { getNestedFiles } from "../utils/DragUtils.js";

/**
 * Custom hook to manage folder tree drag and drop functionality
 */
export function useFolderTreeDragDrop({
  flatFolders,
  selectedFileIds,
  selectedItems,
}: {
  flatFolders: Folder[];
  selectedFileIds: number[];
  selectedItems: AudioFileUI[];
}) {
  // Drag source for folders
  const folderDragSource = useDragSource<Folder>({
    contentType: "folder",
    mode: "file-transfer",
    getItemId: (folder) => folder.id,
  });

  // Drag source for individual files
  const fileDragSource = useDragSource<AudioFileUI>({
    contentType: "file",
    mode: "file-transfer",
    getItemId: (file) => file.id,
  });

  // Folder drag handler
  const handleFolderDragStart = useCallback(
    (e: React.DragEvent, folder: Folder) => {
      console.log("Folder drag start:", folder);
      
      // Get all nested files before starting the drag
      folder.files = getNestedFiles(folder, flatFolders);
      console.log("Nested files:", folder.files);
      
      folderDragSource.handleDragStart(e, [folder]);
    },
    [flatFolders, folderDragSource]
  );

  const handleFolderDragEnd = useCallback(
    (e: React.DragEvent) => {
      folderDragSource.handleDragEnd(e);
    },
    [folderDragSource]
  );

  // File drag handler - handles both single files and selections
  const handleFileDragStart = useCallback(
    (e: React.DragEvent, file: AudioFileUI) => {
      console.log("File drag start:", file);

      // If clicking on a file that's not in the current selection,
      // drag just that file. Otherwise, drag all selected files.
      if (!selectedFileIds.includes(file.id)) {
        fileDragSource.handleDragStart(e, [file]);
      } else {
        fileDragSource.handleDragStart(e, selectedItems);
      }
    },
    [fileDragSource, selectedItems, selectedFileIds]
  );

  const handleFileDragEnd = useCallback(
    (e: React.DragEvent) => {
      fileDragSource.handleDragEnd(e);
    },
    [fileDragSource]
  );

  return {
    handleFolderDragStart,
    handleFolderDragEnd,
    handleFileDragStart,
    handleFileDragEnd
  };
}