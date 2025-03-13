import folderModel from "./folderModel.js";
import { Folder } from 'shared/types/types.js';

export async function getAllFolders(): Promise<Folder[]> {
  return await folderModel.getAllFolders();
}

export async function getFolderById(id: number): Promise<Folder | null> {
  const folders = await folderModel.getFolderById(id);
  return folders.length > 0 ? folders[0] : null;
}


export async function getSubFolders(parentFolderId: number): Promise<Folder[]> {
  return await folderModel.getSubFolders(parentFolderId);
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders
};
