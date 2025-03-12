import { executeQuery } from "../../../db.js";
import { Folder } from 'shared/types/types.js';

export async function getAllFolders(): Promise<Folder[]> {
  return await executeQuery<Folder>('SELECT * FROM folders');
}

export async function getFolderById(folderId: number): Promise<Folder[]> {
  return await executeQuery<Folder>(
    'SELECT * FROM folders WHERE folder_id = ?', 
    [folderId]
  );
}

export async function getFoldersByType(folderType: string): Promise<Folder[]> {
  return await executeQuery<Folder>(
    'SELECT * FROM folders WHERE folder_type = ?',
    [folderType]
  );
}

export async function getSubFolders(parentFolderId: number): Promise<Folder[]> {
  return await executeQuery<Folder>(
    'SELECT * FROM folders WHERE parent_folder_id = ?',
    [parentFolderId]
  );
}

export default {
  getAllFolders,
  getFolderById,
  getFoldersByType,
  getSubFolders
};
