import folderModel from "./folderModel.js";
import type { FolderDB } from "../types.js";
import fs from "fs/promises";
import { toAbsolutePath } from "../../../utils/path-utils.js";

export async function getAllFolders(): Promise<FolderDB[]> {
  return await folderModel.getAllFolders();
}

export async function getFolderById(id: number): Promise<FolderDB | null> {
  const folder = await folderModel.getFolderById(id);
  return folder;
}

export async function getSubFolders(
  parentFolderId: number
): Promise<FolderDB[]> {
  return await folderModel.getSubFolders(parentFolderId);
}

export async function createFolder(
  name: string,
  parentFolderId?: number,
  folderType?: string
): Promise<FolderDB | null> {

  const type = folderType || "any";
  const parent_id = parentFolderId === undefined ? 1 : parentFolderId; // Default to root folder if no parent ID is provided

  // Create database record
  const insertId = await folderModel.createFolder({ name, type, parent_id });

  if (!insertId) {
    return null;
  }

  // Create file system folder
  try {
    const parentPath = await folderModel.getFolderPath(parent_id);
    const folderRelativePath = parentPath ? `${parentPath}/${name}` : name;
    const folderAbsolutePath = toAbsolutePath(folderRelativePath);

    // Create the directory (with recursive option to create any missing parent directories)
    await fs.mkdir(folderAbsolutePath, { recursive: true });
  } catch {
    // Don't fail the whole operation if file system folder creation fails
    // The database entry is still valid and useful
  }
  
  const newFolder = await getFolderById(insertId);

  return newFolder;
}

export async function deleteFolders(
  folderIds: number[]
): Promise<{ success: boolean; deletedCount: number; errors?: string[] }> {
  const errors: string[] = [];
  let deletedCount = 0;

  // First, gather all folders to delete (including children)
  const allFolderIds = new Set<number>();

  for (const folderId of folderIds) {
    allFolderIds.add(folderId);
    const childFolders = await getAllChildFolders(folderId);
    childFolders.forEach((folder) => allFolderIds.add(folder.id));
  }

  // For each folder, delete the file system folder if it exists
  for (const folderId of Array.from(allFolderIds)) {
    try {
      // Get folder info
      const folder = await getFolderById(folderId);
      if (!folder) {
        errors.push(`Folder with ID ${folderId} not found`);
        continue;
      }

      // Get folder path
      const folderPath = await folderModel.getFolderPath(folderId);
      if (folderPath) {
        const folderAbsolutePath = toAbsolutePath(folderPath);

        // Check if folder exists before trying to delete
        try {
          await fs.access(folderAbsolutePath);
          // Delete folder recursively if it exists
          await fs.rm(folderAbsolutePath, { recursive: true, force: true });
        } catch {
          // Folder doesn't exist in filesystem, just continue
        }
      }
    } catch {
      // Error deleting filesystem folder - continue with next folder
    }
  }

  // Delete folders from database
  const result = await folderModel.deleteFolders(Array.from(allFolderIds));
  deletedCount = result.deletedCount;

  return {
    success: errors.length === 0,
    deletedCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Recursively retrieves all child folders of a given parent folder
 */
async function getAllChildFolders(folderId: number): Promise<FolderDB[]> {
  const result: FolderDB[] = [];
  const queue: number[] = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await getSubFolders(currentId);

    for (const child of children) {
      result.push(child);
      queue.push(child.id);
    }
  }

  return result;
}

export async function updateFolder(id: number, name: string): Promise<FolderDB | null> {
  // Only update the name, not parent or type
  const updated = await folderModel.updateFolder(id, name);
  if (!updated) return null;
  return await folderModel.getFolderById(id);
}

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  createFolder,
  deleteFolders,
  updateFolder
};
