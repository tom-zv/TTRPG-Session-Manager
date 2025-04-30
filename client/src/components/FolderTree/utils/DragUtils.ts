import { AudioFile, Folder } from 'src/components/FolderTree/types.js';


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
