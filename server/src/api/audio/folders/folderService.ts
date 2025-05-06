import folderModel from "./folderModel.js";
import { FolderDB } from "./types.js";
import fs from 'fs/promises';
import { toAbsolutePath } from '../../../utils/path-utils.js';

export async function getAllFolders(): Promise<FolderDB[]> {
  return await folderModel.getAllFolders();
}

export async function getFolderById(id: number): Promise<FolderDB | null> {
  const folders = await folderModel.getFolderById(id);
  return folders.length > 0 ? folders[0] : null;
}

export async function getSubFolders(parentFolderId: number): Promise<FolderDB[]> {
  return await folderModel.getSubFolders(parentFolderId);
}

export async function createFolder(name: string, parentFolderId?: number, folderType?: string): Promise<FolderDB | null> {
  try {
    const type = folderType || 'any';
    const parentId = parentFolderId === undefined ? 1 : parentFolderId; // Default to root folder if no parent ID is provided
    
    // Create database record
    const newFolder = await folderModel.createFolder(name, parentId, type);
    
    if (!newFolder) {
      return null;
    }
    
    // Create file system folder
    try {
      const parentPath = await folderModel.getFolderPath(parentId);
      const folderRelativePath = parentPath ? `${parentPath}/${name}` : name;
      const folderAbsolutePath = toAbsolutePath(folderRelativePath);
      
      // Create the directory (with recursive option to create any missing parent directories)
      await fs.mkdir(folderAbsolutePath, { recursive: true });
      console.log(`Created folder at: ${folderAbsolutePath}`);
    } catch (fsError) {
      console.error(`Error creating file system folder for '${name}':`, fsError);
      // Don't fail the whole operation if file system folder creation fails
      // The database entry is still valid and useful
    }
    
    return newFolder;
  } catch (error) {
    console.error(`Error in createFolder:`, error);
    throw error;
  }
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  createFolder
};
