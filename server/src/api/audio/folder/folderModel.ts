import { pool } from "../../../db.js";
import { RowDataPacket } from "mysql2";
import { Folder } from 'shared/types/types.js';

export async function getAllFolders(): Promise<Folder[]> {
  const [rows] = await pool.execute('SELECT * FROM folders');
  return rows as Folder[] & RowDataPacket[];
}

export async function getFolderById(folderId: number): Promise<Folder[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM folders WHERE folder_id = ?', 
    [folderId]
  );
  return rows as Folder[] & RowDataPacket[];
}

export async function getSubFolders(parentFolderId: number): Promise<Folder[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM folders WHERE parent_folder_id = ?',
    [parentFolderId]
  );
  return rows as Folder[] & RowDataPacket[];
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders
};
