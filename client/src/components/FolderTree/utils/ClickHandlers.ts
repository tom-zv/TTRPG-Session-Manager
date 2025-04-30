import React from "react";
import { Folder, AudioFile } from "src/components/FolderTree/types.js";

export const handleFolderClick = (
  e: React.MouseEvent,
  folder: Folder,
  isOpen: boolean,
  setIsOpen: (isOpen: boolean) => void,
  onFolderSelect?: (
    folder: Folder,
    isMultiSelect: boolean,
    isShiftSelect: boolean
  ) => void
) => {
  e.stopPropagation();

  const isMultiSelect = e.ctrlKey || e.metaKey;
  const isShiftSelect = e.shiftKey;

  if (!isMultiSelect && !isShiftSelect) {
    setIsOpen(!isOpen);
  }

  if (onFolderSelect) {
    onFolderSelect(folder, isMultiSelect, isShiftSelect);
  }
};

export const handleFileClick = (
  e: React.MouseEvent,
  file: AudioFile,
  onFileSelect?: (
    file: AudioFile,
    isMultiSelect: boolean,
    isShiftSelect: boolean
  ) => void
) => {
  e.stopPropagation();

  const isMultiSelect = e.ctrlKey || e.metaKey;
  const isShiftSelect = e.shiftKey;

  if (onFileSelect) {
    onFileSelect(file, isMultiSelect, isShiftSelect);
  }
};
