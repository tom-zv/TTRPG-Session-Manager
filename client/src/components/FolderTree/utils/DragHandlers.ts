import { AudioFile } from 'shared/types/audio.js';
import { Folder } from 'shared/types/folder.js';

// Content type constants for drag operations
export const DRAG_TYPES = {
  AUDIO_FILE: 'audio-file',
  FOLDER: 'folder'
};

// Helper function to get all files from a folder, including from subfolders
export const getFilesFromFolder = (
  folder: Folder, 
  allFolders: Folder[], 
  audioFiles: AudioFile[]
): AudioFile[] => {
  const result: AudioFile[] = [];
  
  // Get direct files in this folder
  const directFiles = audioFiles.filter(file => file.folderId === folder.id);
  result.push(...directFiles);
  
  // Get files from subfolders recursively
  if (folder.children && folder.children.length > 0) {
    folder.children.forEach(child => {
      const childFiles = getFilesFromFolder(child, allFolders, audioFiles);
      result.push(...childFiles);
    });
  }
  
  return result;
};

// Get files from multiple folders
export const getFilesFromFolders = (
  folderIds: number[],
  allFolders: Folder[],
  audioFiles: AudioFile[]
): AudioFile[] => {
  const result: AudioFile[] = [];
  
  // Find each folder and get its files
  folderIds.forEach(id => {
    const folder = findFolderById(id, allFolders);
    if (folder) {
      const files = getFilesFromFolder(folder, allFolders, audioFiles);
      result.push(...files);
    }
  });
  
  // Remove duplicates by using a Map with file IDs as keys
  return [...new Map(result.map(file => [file.id, file])).values()];
};

// Helper to find a folder by ID in the nested structure
export const findFolderById = (id: number, folders: Folder[]): Folder | undefined => {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    
    if (folder.children && folder.children.length > 0) {
      const found = findFolderById(id, folder.children);
      if (found) return found;
    }
  }
  
  return undefined;
};

// Get all file IDs from a collection of audio files
export const getFileIds = (files: AudioFile[]): number[] => {
  return files.map(file => file.id);
};

// Helper to filter files by audio type
export const filterFilesByType = (
  files: AudioFile[], 
  type: 'music' | 'sfx' | 'ambience'
): AudioFile[] => {
  return files.filter(file => file.audioType === type);
};

// Handle folder drag with multi-selection support
export const handleFolderDrag = (
  e: React.DragEvent,
  folder: Folder,
  selectedFolderIds: number[],
  allFolders: Folder[],
  audioFiles: AudioFile[],
) => {
  e.stopPropagation();
  
  // Is this folder part of a multi-selection?
  const isMultiSelection = selectedFolderIds.length > 1 && 
    selectedFolderIds.includes(folder.id);
    
  // IDs to use for getting files
  const folderIdsForDrag = isMultiSelection ? selectedFolderIds : [folder.id];
  
  // Get all files from the selected folders
  const filesFromFolders = getFilesFromFolders(folderIdsForDrag, allFolders, audioFiles);
  
  // Create the drag payload
  const payload = {
    contentType: DRAG_TYPES.AUDIO_FILE,
    mode: isMultiSelection ? 'multiple' : 'single',
    items: filesFromFolders,
    count: filesFromFolders.length
  };
  
  // Set the data transfer
  e.dataTransfer.setData('application/json', JSON.stringify(payload));
  
  // Apply visual indicators
  if (isMultiSelection) {
    e.currentTarget.classList.add('dragging-multi');
    e.currentTarget.setAttribute('data-count', filesFromFolders.length.toString());
  } else {
    e.currentTarget.classList.add('dragging');
  }
  
  return filesFromFolders;
};

// Handle file drag with multi-selection support
export const handleFileDrag = (
  e: React.DragEvent,
  file: AudioFile,
  selectedFileIds: number[],
  audioFiles: AudioFile[]
) => {
  e.stopPropagation();
  
  // Is this file part of a multi-selection?
  const isMultiSelection = selectedFileIds.length > 1 && 
    selectedFileIds.includes(file.id);
    
  // Files to drag
  const filesToDrag = isMultiSelection
    ? audioFiles.filter(f => selectedFileIds.includes(f.id))
    : [file];
    
  // Create the drag payload
  const payload = {
    contentType: DRAG_TYPES.AUDIO_FILE,
    mode: isMultiSelection ? 'multiple' : 'single',
    items: filesToDrag,
    count: filesToDrag.length
  };
  
  // Set the data transfer
  e.dataTransfer.setData('application/json', JSON.stringify(payload));
  
  // Apply visual indicators
  if (isMultiSelection) {
    e.currentTarget.classList.add('dragging-multi');
    e.currentTarget.setAttribute('data-count', filesToDrag.length.toString());
  } else {
    e.currentTarget.classList.add('dragging');
  }
  
  return filesToDrag;
};