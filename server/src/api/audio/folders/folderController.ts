import folderService from "./folderService.js";
import { transformFolder } from "../../../utils/format-transformers.js";
import { Request, Response } from 'express';
import { FolderDB } from "./types.js";

export const getAllFolders = async (_req: Request, res: Response) => {
  try {
    const dbFolders = await folderService.getAllFolders();
    const folders = dbFolders.map(folder => transformFolder(folder));
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error getting folders:', error);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
};

export const getFolderById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid folder ID format' });
    }

    const dbFolder = await folderService.getFolderById(id);
    const folder = transformFolder(dbFolder);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.status(200).json(folder);
  } catch (error) {
    console.error('Error getting folder by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve folder' });
  }
};

export const getSubFolders = async (req: Request, res: Response) => {
  try {
    const parentId = parseInt(req.params.parentId);
    if (isNaN(parentId)) {
      return res.status(400).json({ error: 'Invalid parent folder ID format' });
    }

    const dbFolders = await folderService.getSubFolders(parentId);
    const folders = dbFolders.map(folder => transformFolder(folder));
    
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error getting subfolders:', error);
    res.status(500).json({ error: 'Failed to retrieve subfolders' });
  }
};

export const createFolder = async (req: Request, res: Response) => {
  try {
    const { name, parentFolderId, folderType } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required and must be a non-empty string.' });
    }

    if (parentFolderId !== undefined && (typeof parentFolderId !== 'number' || !Number.isInteger(parentFolderId))) {
        return res.status(400).json({ error: 'Invalid parentFolderId format. Must be an integer.' });
    }

    // Validate folder name for file system compatibility
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(name)) {
      return res.status(400).json({ 
        error: 'Folder name contains invalid characters. Avoid: < > : " / \\ | ? *' 
      });
    }

    const validFolderTypes = ['music', 'sfx', 'ambience', 'root', 'any'];
    if (folderType !== undefined && (typeof folderType !== 'string' || !validFolderTypes.includes(folderType))) {
        return res.status(400).json({ error: `Invalid folderType. Must be one of: ${validFolderTypes.join(', ')}.` });
    }

    const dbFolder = await folderService.createFolder(name, parentFolderId, folderType) as FolderDB | null;

    if (!dbFolder) {
      return res.status(500).json({ error: 'Failed to create folder' });
    }
    
    const folder = transformFolder(dbFolder);
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    // Check for specific database errors, e.g., foreign key constraint
    if (error instanceof Error && 'code' in error && (error as any).code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ error: 'Invalid parentFolderId: The specified parent folder does not exist.' });
    }
    // Check for file system errors
    if (error instanceof Error && 'code' in error) {
      const fsErrorCode = (error as any).code;
      if (fsErrorCode === 'EACCES' || fsErrorCode === 'EPERM') {
        return res.status(500).json({ error: 'Permission denied when creating folder' });
      }
      if (fsErrorCode === 'EEXIST') {
        return res.status(409).json({ error: 'A folder with this name already exists' });
      }
    }
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  createFolder
};
