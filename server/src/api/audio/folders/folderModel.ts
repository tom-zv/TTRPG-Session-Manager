import { audioPool } from "../../../db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { FolderDB } from "./types.js";

export async function getAllFolders(): Promise<FolderDB[]> {
  const [rows] = await audioPool.execute('SELECT * FROM folders');
  return rows as FolderDB[] & RowDataPacket[];
}

export async function getFolderById(folderId: number): Promise<FolderDB[]> {
  const [rows] = await audioPool.execute(
    'SELECT * FROM folders WHERE id = ?', 
    [folderId]
  );
  return rows as FolderDB[] & RowDataPacket[];
}

export async function getSubFolders(parentFolderId: number): Promise<FolderDB[]> {
  const [rows] = await audioPool.execute(
    'SELECT * FROM folders WHERE parent_id = ?',
    [parentFolderId]
  );
  return rows as FolderDB[] & RowDataPacket[];
}

export async function createFolder(name: string, parentFolderId: number | null, folderType: string): Promise<FolderDB | null> {
  const [result] = await audioPool.execute<ResultSetHeader>(
    'INSERT INTO folders (name, parent_id, folder_type) VALUES (?, ?, ?)',
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
 * @param id The ID of the folder to get the path for
 * @returns A relative path representing the folder structure
 */
export async function getFolderPath(id: number | null): Promise<string> {
  if (!id) {
    return ""; // Return empty string if no folder ID is provided
  }
  
  const pathParts: string[] = [];
  let currentId: number | null = id;
  
  // Prevent infinite loops in case of circular references
  const visitedIds = new Set<number>();
  
  // Traverse up the folder hierarchy until we reach a root folder
  while (currentId && !visitedIds.has(currentId)) {
    visitedIds.add(currentId);
    
    const folders = await getFolderById(currentId);
    if (!folders || folders.length === 0) {
      break;
    }
    
    const folder = folders[0];
    pathParts.unshift(folder.name); // Add folder name to the beginning of path
    
    currentId = folder.parent_id;
  }
  
  // Join path parts with slashes
  return pathParts.join('/');
}

export async function getFolderType(id: number) : Promise<string>{
    const [rows] = await audioPool.execute(
      'SELECT folder_type from folders WHERE id = ?', [id]
    )

    return (rows as RowDataPacket[])[0].folder_type;
}

export async function updateFolder(folderId: number, name: string): Promise<boolean> {
  const [result] = await audioPool.execute<ResultSetHeader>(
    'UPDATE folders SET name = ? WHERE id = ?',
    [name, folderId]
  );
  return result.affectedRows > 0;
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  getFolderPath,
  createFolder
};
