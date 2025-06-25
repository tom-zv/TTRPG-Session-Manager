import { audioPool } from "../../../db.js";
import { RowDataPacket, ResultSetHeader,  } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import type { FolderDB } from "../types.js";

export async function getAllFolders(): Promise<FolderDB[]> {
  const [rows] = await audioPool.execute("SELECT * FROM folders");
  return rows as FolderDB[] & RowDataPacket[];
}

export async function getFolderById(folderId: number): Promise<FolderDB | null> {
  const [rows] = await audioPool.execute<FolderDB[] & RowDataPacket[]>(
    "SELECT * FROM folders WHERE id = ?",
    [folderId]
  );

  return rows.length > 0 ? rows[0] : null;
}

export async function getSubFolders(
  parentFolderId: number
): Promise<FolderDB[]> {
  const [rows] = await audioPool.execute(
    "SELECT * FROM folders WHERE parent_id = ?",
    [parentFolderId]
  );
  return rows as FolderDB[] & RowDataPacket[];
}

export interface FolderInsertData {
  name: string;
  parentId: number;
  type: string;
}
export async function createFolder(
  folder: FolderInsertData,
  connection?: PoolConnection
): Promise<FolderDB | null> {

  const db = connection ?? audioPool;
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO folders (name, parent_id, folder_type) VALUES (?, ?, ?)",
    [folder.name, folder.parentId, folder.type]
  );

  const insertId = result.insertId;

  if (insertId) {
    const newFolder = await getFolderById(insertId);
    return newFolder;
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

    const folder = await getFolderById(currentId);
    if (!folder) {
      break;
    }

    pathParts.unshift(folder.name); // Add folder name to the beginning of path

    currentId = folder.parent_id;
  }

  // Join path parts with slashes
  return pathParts.join("/");
}

export async function getFolderType(id: number): Promise<string> {
  const [rows] = (await audioPool.execute(
    "SELECT folder_type from folders WHERE id = ?",
    [id]
  )) as RowDataPacket[];

  return rows[0].folder_type;
}

export async function updateFolder(
  folderId: number,
  name: string
): Promise<boolean> {
  const [result] = await audioPool.execute<ResultSetHeader>(
    "UPDATE folders SET name = ? WHERE id = ?",
    [name, folderId]
  );
  return result.affectedRows > 0;
}

export async function deleteFolders(
  folderIds: number[]
): Promise<{ deletedCount: number }> {
  if (folderIds.length === 0) {
    return { deletedCount: 0 };
  }

  // Create placeholders for the SQL query
  const placeholders = folderIds.map(() => "?").join(", ");

  const [result] = await audioPool.execute<ResultSetHeader>(
    `DELETE FROM folders WHERE id IN (${placeholders})`,
    folderIds
  );

  return { deletedCount: result.affectedRows };
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  getFolderPath,
  getFolderType,
  createFolder,
  updateFolder,
  deleteFolders,
};
