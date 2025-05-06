import { pool } from "../../../db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { FolderDB } from "./types.js";

export async function getAllFolders(): Promise<FolderDB[]> {
  const [rows] = await pool.execute('SELECT * FROM folders');
  return rows as FolderDB[] & RowDataPacket[];
}

export async function getFolderById(folderId: number): Promise<FolderDB[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM folders WHERE folder_id = ?', 
    [folderId]
  );
  return rows as FolderDB[] & RowDataPacket[];
}

export async function getSubFolders(parentFolderId: number): Promise<FolderDB[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM folders WHERE parent_folder_id = ?',
    [parentFolderId]
  );
  return rows as FolderDB[] & RowDataPacket[];
}

export async function createFolder(name: string, parentFolderId: number | null, folderType: string): Promise<FolderDB | null> {
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO folders (name, parent_folder_id, folder_type) VALUES (?, ?, ?)',
    [name, parentFolderId, folderType]
  );
  const insertId = result.insertId;
  if (insertId) {
    const newFolders = await getFolderById(insertId);
    return newFolders.length > 0 ? newFolders[0] : null;
  }
  return null;
}

/**
 * Generate a filesystem path based on folder hierarchy in database
 * @param folderId The ID of the folder to get the path for
 * @returns A relative path representing the folder structure
 */
export async function getFolderPath(folderId: number | null): Promise<string> {
  if (!folderId) {
    return ""; // Return empty string if no folder ID is provided
  }
  
  const pathParts: string[] = [];
  let currentFolderId: number | null = folderId;
  
  // Prevent infinite loops in case of circular references
  const visitedIds = new Set<number>();
  
  // Traverse up the folder hierarchy until we reach a root folder
  while (currentFolderId && !visitedIds.has(currentFolderId)) {
    visitedIds.add(currentFolderId);
    
    const folders = await getFolderById(currentFolderId);
    if (!folders || folders.length === 0) {
      break;
    }
    
    const folder = folders[0];
    pathParts.unshift(folder.name); // Add folder name to the beginning of path
    
    currentFolderId = folder.parent_folder_id;
  }
  
  // Join path parts with slashes
  return pathParts.join('/');
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  getFolderPath,
  createFolder
};
